import { AppError } from '../utils/AppError.js';
import { getCurrentGoldRate, getCurrentGoldRates } from '../repositories/goldRates.repository.js';
import { findDiamondConfigById } from '../repositories/diamondConfigs.repository.js';

// karat/24 — default purity multiplier (plan §9a: "overridable in settings
// if market convention differs"; no settings table exists in the approved
// schema, so this is the hardcoded default for now).
const PURITY_KARATS = { '14K': 14, '18K': 18, '22K': 22, '24K': 24 };

export function deriveRatesFromBase24k(rate24k) {
  return Object.entries(PURITY_KARATS).map(([purity, karat]) => ({
    purity,
    ratePerGram: Math.round(((rate24k * karat) / 24) * 100) / 100,
  }));
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

export async function computeGoldValue(netWeightGrams, purity) {
  const rate = await getCurrentGoldRate(purity);
  if (!rate) throw new AppError(409, `No gold rate available yet for purity ${purity}`);
  return { goldValue: round2(netWeightGrams * Number(rate.rate_per_gram)), goldRateId: rate.id };
}

export async function computeDiamondValue(diamondWeightCarats, diamondConfigId) {
  if (!diamondWeightCarats) return { diamondValue: 0 };
  if (!diamondConfigId) throw new AppError(409, 'No diamond quality tier selected');

  const config = await findDiamondConfigById(diamondConfigId);
  if (!config) throw new AppError(409, 'Selected diamond quality tier no longer exists');
  // Weight is stored in carats; diamond quality tiers are rated per cent
  // (1 carat = 100 cents), matching the admin's Diamond Weight (cents)
  // input — convert before applying the rate.
  const diamondWeightCents = diamondWeightCarats * 100;
  return { diamondValue: round2(diamondWeightCents * Number(config.rate_per_carat)) };
}

// selling_price = gold + diamond + making + GST-on-that-subtotal (plan §6
// price breakup example: "Gold + Diamond + Making Charges + GST = Total").
export function computeSellingPrice({ goldValue, diamondValue, makingCharge, gstPercent }) {
  const subtotal = goldValue + diamondValue + makingCharge;
  const gstAmount = subtotal * (gstPercent / 100);
  return round2(subtotal + gstAmount);
}

export async function previewPricing({
  metalType,
  purity,
  netWeightGrams,
  diamondWeightCarats,
  diamondConfigId,
  makingCharge = 0,
  gstPercent = 3,
}) {
  const goldValue =
    metalType === 'GOLD' && purity && netWeightGrams
      ? (await computeGoldValue(netWeightGrams, purity)).goldValue
      : 0;
  const diamondValue = diamondWeightCarats
    ? (await computeDiamondValue(diamondWeightCarats, diamondConfigId)).diamondValue
    : 0;
  const sellingPrice = computeSellingPrice({ goldValue, diamondValue, makingCharge, gstPercent });

  return { goldValue, diamondValue, makingCharge, gstPercent, sellingPrice };
}

export function getCurrentRatesSnapshot() {
  return getCurrentGoldRates();
}

// Prices a product's line for a customer-selected Gold Color / Purity /
// Diamond Quality combination. Gold Color never affects price (same karat,
// different alloy) so it isn't a parameter here. When purity/diamondConfigId
// match the product's own base values (the common case — no override
// selected, or the axis isn't configured for this product), the product's
// already-cached gold_value/diamond_value are reused as-is instead of
// re-querying rates — same numbers cart/checkout showed before variants
// existed, zero regression for products with no configured options.
export async function computeVariantPricing(product, { purity, diamondConfigId } = {}) {
  const effectivePurity = purity || product.purity;
  const effectiveDiamondConfigId = diamondConfigId || product.diamond_config_id;

  let goldValue = Number(product.gold_value);
  if (
    effectivePurity &&
    effectivePurity !== product.purity &&
    product.metal_type === 'GOLD' &&
    product.net_weight_grams != null
  ) {
    goldValue = (await computeGoldValue(Number(product.net_weight_grams), effectivePurity)).goldValue;
  }

  let diamondValue = Number(product.diamond_value);
  if (
    effectiveDiamondConfigId &&
    effectiveDiamondConfigId !== product.diamond_config_id &&
    product.diamond_weight_carats
  ) {
    diamondValue = (
      await computeDiamondValue(Number(product.diamond_weight_carats), effectiveDiamondConfigId)
    ).diamondValue;
  }

  const makingCharge = Number(product.making_charge);
  const gstPercent = Number(product.gst_percent);
  const sellingPrice = computeSellingPrice({ goldValue, diamondValue, makingCharge, gstPercent });
  const gstAmount = round2(sellingPrice - goldValue - diamondValue - makingCharge);

  return {
    purity: effectivePurity,
    diamondConfigId: effectiveDiamondConfigId,
    goldValue,
    diamondValue,
    makingCharge,
    gstAmount,
    sellingPrice,
  };
}
