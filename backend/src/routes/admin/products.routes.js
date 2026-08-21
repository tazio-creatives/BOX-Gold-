import { Router } from 'express';
import {
  adminList,
  adminGet,
  adminCreate,
  adminUpdate,
  adminDelete,
  setFeatured,
} from '../../controllers/products.controller.js';
import { setPriceLock } from '../../controllers/pricing.controller.js';
import {
  list as listImages,
  uploadOriginal,
  setPrimary,
  reorder,
  remove as removeImage,
} from '../../controllers/productImages.controller.js';
import { getStatus, approve, reject, regenerate } from '../../controllers/aiImages.controller.js';
import {
  createJob as createStudioJob,
  getActiveJob as getActiveStudioJob,
  getJob as getStudioJob,
  confirmJob as confirmStudioJob,
  retryAsset as retryStudioAsset,
  updateAssetSelection as updateStudioAssetSelection,
  importAsset as importStudioAsset,
  completeImport as completeStudioImport,
  cancelJob as cancelStudioJob,
} from '../../controllers/aiStudio.controller.js';
import { upload, uploadEnhanceImage } from '../../middleware/upload.js';
import { aiStudioRateLimiter } from '../../middleware/rateLimit.js';

// Mounted at /api/v1/admin/products.
export const adminProductsRouter = Router();

adminProductsRouter.get('/', adminList);
adminProductsRouter.post('/', adminCreate);
adminProductsRouter.get('/:id', adminGet);
adminProductsRouter.patch('/:id', adminUpdate);
adminProductsRouter.delete('/:id', adminDelete);
adminProductsRouter.patch('/:id/price-lock', setPriceLock);
adminProductsRouter.patch('/:id/featured', setFeatured);

// Product photo gallery (plan §9/§10).
adminProductsRouter.get('/:id/images', listImages);
adminProductsRouter.post('/:id/images', upload.single('image'), uploadOriginal);
adminProductsRouter.patch('/:id/images/reorder', reorder);
adminProductsRouter.patch('/:id/images/:sortOrder/primary', setPrimary);
adminProductsRouter.delete('/:id/images/:sortOrder', removeImage);

// AI image job workflow (plan §10).
adminProductsRouter.get('/:id/ai-images', getStatus);
adminProductsRouter.post('/:id/ai-images/regenerate', regenerate);
adminProductsRouter.post('/:id/ai-images/:imageId/approve', approve);
adminProductsRouter.post('/:id/ai-images/:imageId/reject', reject);

// AI Image Studio — separate, deliberately opt-in pipeline (upload -> analyse
// & confirm -> choose presenter -> generate N images -> review & import).
// /active is registered before the /:jobId param route below, or Express
// would treat "active" as a jobId.
adminProductsRouter.get('/:id/ai-studio/active', getActiveStudioJob);
adminProductsRouter.post(
  '/:id/ai-studio',
  aiStudioRateLimiter,
  uploadEnhanceImage.array('images', 4),
  createStudioJob,
);
adminProductsRouter.get('/:id/ai-studio/:jobId', getStudioJob);
adminProductsRouter.post('/:id/ai-studio/:jobId/confirm', aiStudioRateLimiter, confirmStudioJob);
adminProductsRouter.post(
  '/:id/ai-studio/:jobId/assets/:assetId/retry',
  aiStudioRateLimiter,
  retryStudioAsset,
);
adminProductsRouter.patch('/:id/ai-studio/:jobId/assets/:assetId', updateStudioAssetSelection);
adminProductsRouter.post('/:id/ai-studio/:jobId/assets/:assetId/import', importStudioAsset);
adminProductsRouter.post('/:id/ai-studio/:jobId/import/complete', completeStudioImport);
adminProductsRouter.post('/:id/ai-studio/:jobId/cancel', cancelStudioJob);
