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
import {
  list as listDiamondTypes,
  create as createDiamondType,
  update as updateDiamondType,
} from '../../controllers/diamondTypes.controller.js';
import {
  list as listRules,
  get as getRule,
  create as createRule,
  update as updateRule,
  remove as removeRule,
  activate as activateRule,
  disable as disableRule,
  previewUnsaved as previewUnsavedRule,
  previewSaved as previewSavedRule,
  reprice as repriceRule,
  getRepriceJob,
  listRepriceJobs,
  listAudit,
} from '../../controllers/pricingRules.controller.js';
import { list as listProductOverrides, bulk as bulkProductOverrides } from '../../controllers/productOverrides.controller.js';
import { requirePermission } from '../../middleware/adminAuth.js';

// Mounted at /api/v1/admin/pricing.
export const adminPricingRouter = Router();

adminPricingRouter.use(requirePermission('pricing'));
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

// Pricing Rule Management (Phase 3).
adminPricingRouter.get('/diamond-types', listDiamondTypes);
adminPricingRouter.post('/diamond-types', createDiamondType);
adminPricingRouter.put('/diamond-types/:id', updateDiamondType);

adminPricingRouter.get('/rules', listRules);
adminPricingRouter.post('/rules', createRule);
adminPricingRouter.post('/rules/preview', previewUnsavedRule);
adminPricingRouter.get('/rules/:ruleId', getRule);
adminPricingRouter.put('/rules/:ruleId', updateRule);
adminPricingRouter.delete('/rules/:ruleId', removeRule);
adminPricingRouter.post('/rules/:ruleId/activate', activateRule);
adminPricingRouter.post('/rules/:ruleId/disable', disableRule);
adminPricingRouter.post('/rules/:ruleId/preview', previewSavedRule);
adminPricingRouter.post('/rules/:ruleId/reprice', repriceRule);

adminPricingRouter.get('/reprice-jobs', listRepriceJobs);
adminPricingRouter.get('/reprice-jobs/:jobId', getRepriceJob);

adminPricingRouter.get('/product-overrides', listProductOverrides);
adminPricingRouter.patch('/product-overrides/bulk', bulkProductOverrides);

adminPricingRouter.get('/audit', listAudit);
