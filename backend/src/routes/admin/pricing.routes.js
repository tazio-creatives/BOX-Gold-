import { Router } from 'express';
import { getGoldRates, syncGoldRates, preview } from '../../controllers/pricing.controller.js';
import {
  list as listDiamondConfigs,
  create as createDiamondConfig,
  update as updateDiamondConfig,
  remove as removeDiamondConfig,
} from '../../controllers/diamondConfigs.controller.js';

// Mounted at /api/v1/admin/pricing.
export const adminPricingRouter = Router();

adminPricingRouter.get('/gold-rates', getGoldRates);
adminPricingRouter.post('/gold-rates/sync', syncGoldRates);
adminPricingRouter.get('/diamond-configs', listDiamondConfigs);
adminPricingRouter.post('/diamond-configs', createDiamondConfig);
adminPricingRouter.put('/diamond-configs/:id', updateDiamondConfig);
adminPricingRouter.delete('/diamond-configs/:id', removeDiamondConfig);
adminPricingRouter.post('/preview', preview);
