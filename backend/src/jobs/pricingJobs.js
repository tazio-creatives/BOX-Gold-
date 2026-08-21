import { boss } from './queue.js';
import { withTransaction } from '../config/db.js';
import { metalRateProvider } from '../providers/metalRate/index.js';
import { deriveRatesFromBase24k, computeSellingPrice } from '../services/pricingService.js';
import { insertGoldRates, getCurrentGoldRate } from '../repositories/goldRates.repository.js';
import { findDiamondConfigById } from '../repositories/diamondConfigs.repository.js';
import { insertPriceHistory } from '../repositories/productPriceHistory.repository.js';
import {
  findGoldProductsForRecalculation,
  findDiamondProductsForRecalculation,
  updateProductPricingTx,
} from '../repositories/products.repository.js';
import { invalidateProductsPagesBatch } from '../services/pageCacheInvalidation.js';

export const JOB_GOLD_RATE_SYNC = 'gold-rate-sync';
export const JOB_RECALCULATE_GOLD = 'recalculate-gold-prices';
export const JOB_RECALCULATE_DIAMOND = 'recalculate-diamond-prices';

// Rate sync flow (plan §9a): fetch 24K, derive 14/18/22/24K, insert 4 rows,
// enqueue the recalculation pass — never recalculates inline.
async function goldRateSyncHandler() {
  const { ratePerGram, source } = await metalRateProvider.fetchRate('GOLD');
  const derived = deriveRatesFromBase24k(ratePerGram);
  await insertGoldRates(derived, source);
  await boss.send(JOB_RECALCULATE_GOLD, {});
}

async function recalculateGoldPricesHandler() {
  const products = await findGoldProductsForRecalculation();
  for (const product of products) {
    const rate = await getCurrentGoldRate(product.purity);
    if (!rate) continue;

    const goldValue =
      Math.round(Number(product.gold_weight_grams) * Number(rate.rate_per_gram) * 100) / 100;
    const diamondValue = Number(product.diamond_value);
    const sellingPrice = computeSellingPrice({
      goldValue,
      diamondValue,
      makingCharge: Number(product.making_charge),
      gstPercent: Number(product.gst_percent),
    });

    await withTransaction(async (client) => {
      await updateProductPricingTx(client, product.id, { goldValue, diamondValue, sellingPrice });
      await insertPriceHistory(client, {
        productId: product.id,
        oldSellingPrice: product.selling_price,
        newSellingPrice: sellingPrice,
        goldRateId: rate.id,
        reason: 'RATE_SYNC',
      });
    });
  }
  await invalidateProductsPagesBatch(products);
}

// pg-boss v10's work() callback receives an array of jobs, not a single job
// (see aiImageJob.js/emailJob.js) — batchSize defaults to 1 here too.
async function recalculateDiamondPricesHandler(jobs) {
  const [job] = jobs;
  const { diamondConfigId } = job.data;

  const config = await findDiamondConfigById(diamondConfigId);
  if (!config) return;

  const products = await findDiamondProductsForRecalculation(diamondConfigId);
  for (const product of products) {
    // Rate is per cent (1 carat = 100 cents) — see pricingService.computeDiamondValue.
    const diamondWeightCents = Number(product.diamond_weight_carats) * 100;
    const diamondValue = Math.round(diamondWeightCents * Number(config.rate_per_carat) * 100) / 100;
    const goldValue = Number(product.gold_value);
    const sellingPrice = computeSellingPrice({
      goldValue,
      diamondValue,
      makingCharge: Number(product.making_charge),
      gstPercent: Number(product.gst_percent),
    });

    await withTransaction(async (client) => {
      await updateProductPricingTx(client, product.id, { goldValue, diamondValue, sellingPrice });
      await insertPriceHistory(client, {
        productId: product.id,
        oldSellingPrice: product.selling_price,
        newSellingPrice: sellingPrice,
        goldRateId: null,
        reason: 'DIAMOND_RATE_CHANGE',
      });
    });
  }
  await invalidateProductsPagesBatch(products);
}

export async function registerPricingWorkers() {
  // pg-boss v10 requires queues to be created explicitly before scheduling/
  // sending/working them — createQueue() is idempotent, safe on every boot.
  for (const name of [JOB_GOLD_RATE_SYNC, JOB_RECALCULATE_GOLD, JOB_RECALCULATE_DIAMOND]) {
    await boss.createQueue(name);
  }

  await boss.work(JOB_GOLD_RATE_SYNC, goldRateSyncHandler);
  await boss.work(JOB_RECALCULATE_GOLD, recalculateGoldPricesHandler);
  await boss.work(JOB_RECALCULATE_DIAMOND, recalculateDiamondPricesHandler);
}
