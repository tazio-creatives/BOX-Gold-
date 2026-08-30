import { boss } from './queue.js';
import { withTransaction } from '../config/db.js';
import { metalRateProvider } from '../providers/metalRate/index.js';
import { deriveRatesFromBase24k } from '../services/pricingService.js';
import { insertGoldRates } from '../repositories/goldRates.repository.js';
import { findDiamondConfigById } from '../repositories/diamondConfigs.repository.js';
import { insertPriceHistory } from '../repositories/productPriceHistory.repository.js';
import { findGoldProductsForRecalculation, findDiamondProductsForRecalculation, findProductById } from '../repositories/products.repository.js';
import { applyCheapestVariantPricing } from '../services/productsService.js';
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

// Every product_variants row is priced live via computeVariantPricing at
// read time (always querying the current gold rate) — nothing per-variant
// to recalculate here. What DOES need proactive recalculation is each
// product's own cached base price (used for listing display before a
// shopper picks a variant), re-derived as the cheapest available variant's
// price — applyCheapestVariantPricing already does exactly that, so this
// handler's job is just: for every affected product, re-run it and log the
// price-history delta.
async function recalculateGoldPricesHandler() {
  const products = await findGoldProductsForRecalculation();
  for (const product of products) {
    const oldSellingPrice = product.selling_price;
    await applyCheapestVariantPricing(product.id, false);
    const updated = await findProductById(product.id);
    if (!updated || Number(updated.selling_price) === Number(oldSellingPrice)) continue;

    await withTransaction((client) =>
      insertPriceHistory(client, {
        productId: product.id,
        oldSellingPrice,
        newSellingPrice: updated.selling_price,
        goldRateId: null,
        reason: 'RATE_SYNC',
      }),
    );
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
    const oldSellingPrice = product.selling_price;
    await applyCheapestVariantPricing(product.id, false);
    const updated = await findProductById(product.id);
    if (!updated || Number(updated.selling_price) === Number(oldSellingPrice)) continue;

    await withTransaction((client) =>
      insertPriceHistory(client, {
        productId: product.id,
        oldSellingPrice,
        newSellingPrice: updated.selling_price,
        goldRateId: null,
        reason: 'DIAMOND_RATE_CHANGE',
      }),
    );
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
