// Read-only audit: for every PUBLISHED product's variants, compares the
// four weight sources (exact Purity+Size rule, Purity-only rule, the
// variant's own legacy gold_weight_grams, the product's base weight) and
// reports which weight was used under the OLD precedence (variant column
// wins outright) versus the NEW precedence (rules checked first — see
// pricingService.js's computeVariantPricing), plus the resulting
// customer-facing price under each, so every change can be reviewed before
// deploying the fix. Modifies nothing — SELECTs only.
//
// Usage: node backend/scripts/auditWeightPrecedence.js > audit.csv
//        node backend/scripts/auditWeightPrecedence.js --status=PUBLISHED,DRAFT > audit.csv

import { query, pool } from '../src/config/db.js';
import { findProductById } from '../src/repositories/products.repository.js';
import { findVariantsByProductId, resolvedPurity, resolvedSizeLabel } from '../src/repositories/productVariants.repository.js';
import { findWeightRuleValuesByProduct } from '../src/repositories/weightRules.repository.js';
import {
  computeVariantPricing,
  computeGoldValue,
  computeSellingPrice,
  applyProductOffer,
} from '../src/services/pricingService.js';

const statusArg = process.argv.find((a) => a.startsWith('--status='));
const statuses = statusArg ? statusArg.split('=')[1].split(',') : ['PUBLISHED'];

function csvCell(value) {
  if (value == null) return '';
  const s = String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function csvRow(cells) {
  return cells.map(csvCell).join(',');
}

// Legacy precedence, exactly as computeVariantPricing resolved weight
// before this fix — reconstructed here purely for before/after comparison,
// not used anywhere in the live app any more.
function legacyResolvedWeight({ variantWeight, exactRuleWeight, purityDefaultWeight, productBaseWeight }) {
  const ruleWeight = exactRuleWeight ?? purityDefaultWeight;
  return variantWeight ?? ruleWeight ?? productBaseWeight;
}

// New precedence (matches the fixed computeVariantPricing): rules first.
function fixedResolvedWeight({ variantWeight, exactRuleWeight, purityDefaultWeight, productBaseWeight }) {
  const ruleWeight = exactRuleWeight ?? purityDefaultWeight;
  return ruleWeight ?? variantWeight ?? productBaseWeight;
}

// Re-runs the same selling-price formula computeVariantPricing uses,
// swapped to a specific gold weight, so the OLD-precedence price can be
// compared against the (already-live) NEW-precedence price for the same
// variant. Diamond value and the discount percents are weight-independent,
// so they're taken as-is from the real (new) computation; only goldValue
// and any percent-based making charge are re-derived for the given weight.
async function priceForWeight(product, purity, weightGrams, newPricing) {
  if (weightGrams == null || product.metal_type !== 'GOLD') return null;
  const { goldValue } = await computeGoldValue(weightGrams, purity);
  const makingChargePercent = product.making_charge_percent == null ? null : Number(product.making_charge_percent);
  const makingCharge =
    makingChargePercent != null && goldValue > 0
      ? Math.round(goldValue * (makingChargePercent / 100) * 100) / 100
      : Number(product.making_charge);
  const gstPercent = Number(product.gst_percent);
  const baseSellingPrice = computeSellingPrice({
    goldValue,
    diamondValue: newPricing.diamondValueOriginal,
    makingCharge,
    gstPercent,
  });
  const offer = applyProductOffer({
    goldValue,
    diamondValue: newPricing.diamondValueOriginal,
    makingCharge,
    gstPercent,
    sellingPrice: baseSellingPrice,
    makingChargeDiscountPercent: newPricing.makingChargeDiscountPercent,
    diamondDiscountPercent: newPricing.diamondDiscountPercent,
  });
  return offer.sellingPrice;
}

async function main() {
  const { rows: products } = await query('SELECT id, name FROM products WHERE status = ANY($1) ORDER BY name', [
    statuses,
  ]);

  console.log(
    csvRow([
      'productId',
      'productName',
      'variantId',
      'sku',
      'purity',
      'size',
      'exactRuleWeightGrams',
      'purityDefaultWeightGrams',
      'variantWeightGrams',
      'productFallbackWeightGrams',
      'currentlyCalculatedWeightGrams',
      'weightAfterFixGrams',
      'weightWillChange',
      'currentSellingPrice',
      'sellingPriceAfterFix',
      'priceWillChange',
      'isPriceOverridden',
    ]),
  );

  let scanned = 0;
  let changedCount = 0;

  for (const productRow of products) {
    const product = await findProductById(productRow.id);
    if (!product) continue;

    const variants = await findVariantsByProductId(product.id);
    const weightRules = await findWeightRuleValuesByProduct(product.id);

    for (const variant of variants) {
      const purityValueId = variant?.attributes?.purity?.valueId ?? null;
      if (purityValueId == null) continue; // this precedence only applies to purity-varying combinations
      const sizeValueId = variant?.attributes?.size?.valueId ?? null;

      const exactRule = sizeValueId
        ? weightRules.find((r) => r.purity_value_id === purityValueId && r.size_value_id === sizeValueId)
        : null;
      const purityRule = weightRules.find((r) => r.purity_value_id === purityValueId && r.size_value_id === null);

      const exactRuleWeight = exactRule ? Number(exactRule.gold_weight_grams) : null;
      const purityDefaultWeight = purityRule ? Number(purityRule.gold_weight_grams) : null;
      const variantWeight = variant.gold_weight_grams != null ? Number(variant.gold_weight_grams) : null;
      const productBaseWeight = product.gold_weight_grams != null ? Number(product.gold_weight_grams) : null;

      const currentWeight = legacyResolvedWeight({
        variantWeight,
        exactRuleWeight,
        purityDefaultWeight,
        productBaseWeight,
      });
      const fixedWeight = fixedResolvedWeight({
        variantWeight,
        exactRuleWeight,
        purityDefaultWeight,
        productBaseWeight,
      });
      const weightWillChange = currentWeight !== fixedWeight;

      scanned += 1;

      const isPriceOverridden = variant.price_override != null;
      let currentSellingPrice = null;
      let sellingPriceAfterFix = null;
      let priceWillChange = false;

      if (!isPriceOverridden) {
        // computeVariantPricing already implements the NEW (fixed)
        // precedence, so this call directly gives the "after" price.
        const newPricing = await computeVariantPricing(product, variant, weightRules);
        sellingPriceAfterFix = newPricing.sellingPrice;
        const purity = resolvedPurity(variant) || product.purity;
        currentSellingPrice = weightWillChange
          ? await priceForWeight(product, purity, currentWeight, newPricing)
          : newPricing.sellingPrice;
        if (currentSellingPrice != null) {
          priceWillChange = Math.abs(currentSellingPrice - sellingPriceAfterFix) > 0.01;
        }
      }

      if (weightWillChange) changedCount += 1;

      console.log(
        csvRow([
          product.id,
          product.name,
          variant.id,
          variant.sku ?? '',
          resolvedPurity(variant) || product.purity || '',
          resolvedSizeLabel(variant) ?? '',
          exactRuleWeight,
          purityDefaultWeight,
          variantWeight,
          productBaseWeight,
          currentWeight,
          fixedWeight,
          weightWillChange,
          currentSellingPrice,
          sellingPriceAfterFix,
          priceWillChange,
          isPriceOverridden,
        ]),
      );
    }
  }

  console.error(`Scanned ${scanned} purity-bearing variant rows across ${products.length} products (status: ${statuses.join(', ')}).`);
  console.error(`${changedCount} variant row(s) will resolve to a different weight after the fix.`);
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
