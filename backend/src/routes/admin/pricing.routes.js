import { Router } from 'express';
import {
  getGoldRates,
  syncGoldRates,
  preview,
  getGoldRateSettings,
  putGoldRateSettings,
  postManualGoldRate,
} from '../../controllers/pricing.controller.js';
import { goldRateSyncRateLimiter } from '../../middleware/rateLimit.js';
import {
  list as listDiamondConfigs,
  create as createDiamondConfig,
  update as updateDiamondConfig,
  remove as removeDiamondConfig,
} from '../../controllers/diamondConfigs.controller.js';

// Mounted at /api/v1/admin/pricing.
export const adminPricingRouter = Router();

adminPricingRouter.get('/gold-rates', getGoldRates);
adminPricingRouter.post('/gold-rates/sync', goldRateSyncRateLimiter, syncGoldRates);
adminPricingRouter.get('/gold-rate-settings', getGoldRateSettings);
adminPricingRouter.put('/gold-rate-settings', putGoldRateSettings);
adminPricingRouter.post('/gold-rate-settings/manual-rate', postManualGoldRate);
adminPricingRouter.get('/diamond-configs', listDiamondConfigs);
adminPricingRouter.post('/diamond-configs', createDiamondConfig);
adminPricingRouter.put('/diamond-configs/:id', updateDiamondConfig);
adminPricingRouter.delete('/diamond-configs/:id', removeDiamondConfig);
adminPricingRouter.post('/preview', preview);
