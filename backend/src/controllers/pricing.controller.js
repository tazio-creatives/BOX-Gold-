import { pricingPreviewSchema, priceLockSchema } from '../validators/pricing.validators.js';
import * as pricingService from '../services/pricingService.js';
import { listGoldRateHistory } from '../repositories/goldRates.repository.js';
import { updateProduct } from '../repositories/products.repository.js';
import { boss } from '../jobs/queue.js';
import { JOB_GOLD_RATE_SYNC } from '../jobs/pricingJobs.js';
import { NotFoundError } from '../utils/AppError.js';
import { invalidateProductPages } from '../services/pageCacheInvalidation.js';

export async function getGoldRates(req, res, next) {
  try {
    const [current, history] = await Promise.all([
      pricingService.getCurrentRatesSnapshot(),
      listGoldRateHistory({
        page: Number(req.query.page) || 1,
        limit: Number(req.query.limit) || 50,
      }),
    ]);
    res.json({ current, history: history.items, total: history.total });
  } catch (err) {
    next(err);
  }
}

// Manual "Sync Now" — enqueues the identical job the scheduled cron uses, so
// both paths run the exact same code (plan §9a).
export async function syncGoldRates(req, res, next) {
  try {
    await boss.send(JOB_GOLD_RATE_SYNC, {});
    res.status(202).json({ message: 'Gold rate sync started' });
  } catch (err) {
    next(err);
  }
}

export async function preview(req, res, next) {
  try {
    const input = pricingPreviewSchema.parse(req.body);
    const result = await pricingService.previewPricing(input);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function setPriceLock(req, res, next) {
  try {
    const { locked } = priceLockSchema.parse(req.body);
    const product = await updateProduct(req.params.id, { isPriceLocked: locked });
    if (!product) throw new NotFoundError('Product not found');
    await invalidateProductPages(product);
    res.json({ id: product.id, isPriceLocked: product.is_price_locked });
  } catch (err) {
    next(err);
  }
}
