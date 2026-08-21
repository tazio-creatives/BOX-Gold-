import crypto from 'node:crypto';
import sharp from 'sharp';
import { z } from 'zod';
import { AppError, NotFoundError } from '../utils/AppError.js';
import { env } from '../config/env.js';
import { boss } from '../jobs/queue.js';
import { JOB_AI_STUDIO_ANALYSE, JOB_AI_STUDIO_GENERATE, resetAssetForRetry } from '../jobs/aiStudioJob.js';
import { JEWELLERY_TYPES, resolveAssetTypesForJob, ASSET_DISPLAY_ORDER } from '../services/aiStudioService.js';
import { findPresenterById } from '../repositories/presenters.repository.js';
import { storageProvider } from '../providers/storage/index.js';
import { processAndStoreImage } from '../services/imageProcessingService.js';
import { withTransaction } from '../config/db.js';
import { findProductById, findProductImages } from '../repositories/products.repository.js';
import {
  findActiveJobByProduct,
  insertJob,
  findJobById,
  lockJobById,
  updateJob,
  updateJobTx,
  findCategoryTemplate,
  insertAssets,
  findAssetsByJobId,
  findAssetsByJobIdTx,
  findAssetById,
  lockAssetByIdTx,
  updateAsset,
  updateAssetTx,
  clearFeaturedForJobTx,
  findMaxSortOrderTx,
  clearPrimaryForProductTx,
  insertProductImageTx,
} from '../repositories/aiStudio.repository.js';

const MIN_DIMENSION_PX = 200;
const MAX_DIMENSION_PX = 8000;
const CATALOGUE_ASSET_TYPES = ['YELLOW_FRONT', 'YELLOW_HERO_45', 'ROSE_FRONT', 'ROSE_HERO_45'];

export const confirmSchema = z.object({
  jewelleryType: z.enum(JEWELLERY_TYPES.filter((t) => t !== 'UNKNOWN')),
  categoryId: z.string().uuid().nullable().optional(),
  presenterId: z.string().uuid().nullable().optional(),
  generateRoseGold: z.boolean().optional(),
});

const selectionSchema = z.object({
  selected: z.boolean().optional(),
  isFeatured: z.boolean().optional(),
});

function keyFromUrl(url) {
  return new URL(url).pathname.replace(/^\/uploads\//, '');
}

// API responses never include raw storage keys, prompts, or generation
// internals (plan §11) — only public URLs and safe status fields.
function assetDto(asset) {
  return {
    id: asset.id,
    assetType: asset.asset_type,
    displayOrder: asset.display_order,
    status: asset.status,
    imageUrl: asset.image_key ? `${env.uploadsPublicBaseUrl}/${asset.image_key}` : null,
    qualityAssessment: asset.quality_assessment,
    selected: asset.selected,
    isFeatured: asset.is_featured,
    imported: asset.imported,
    retryCount: asset.retry_count,
    generationStartedAt: asset.generation_started_at,
    generationCompletedAt: asset.generation_completed_at,
    error: asset.error,
  };
}

function jobDto(job, assets, presenter) {
  return {
    id: job.id,
    productId: job.product_id,
    status: job.status,
    referenceImageUrls: job.reference_image_urls,
    analysis: job.analysis,
    analysisConfidence: job.analysis_confidence == null ? null : Number(job.analysis_confidence),
    categoryConfidenceThreshold: env.aiStudioCategoryConfidenceThreshold,
    jewelleryType: job.jewellery_type,
    categoryId: job.category_id,
    presenterId: job.presenter_id,
    presenter: presenter
      ? { id: presenter.id, displayName: presenter.display_name, styleLabel: presenter.style_label }
      : null,
    generateRoseGold: job.generate_rose_gold,
    error: job.error,
    createdAt: job.created_at,
    confirmedAt: job.confirmed_at,
    completedAt: job.completed_at,
    assets: assets.map(assetDto),
  };
}

async function validateImageFile(file) {
  let metadata;
  try {
    metadata = await sharp(file.buffer).metadata();
  } catch {
    throw new AppError(400, `"${file.originalname}" is not a valid image file`);
  }
  if (!['jpeg', 'png', 'webp'].includes(metadata.format)) {
    throw new AppError(400, `"${file.originalname}" is not a supported image format`);
  }
  if (metadata.width < MIN_DIMENSION_PX || metadata.height < MIN_DIMENSION_PX) {
    throw new AppError(400, `"${file.originalname}" is too small — minimum ${MIN_DIMENSION_PX}px per side`);
  }
  if (metadata.width > MAX_DIMENSION_PX || metadata.height > MAX_DIMENSION_PX) {
    throw new AppError(400, `"${file.originalname}" is too large — maximum ${MAX_DIMENSION_PX}px per side`);
  }
}

// Upload 1 primary + up to 3 supporting reference photos (4 total), create
// the job, kick off analysis. Rejects with 409 (returning the existing job
// id) if one is already active for this product — enforced here and by the
// partial unique index, so a double-click race still fails cleanly rather
// than 500ing (plan §8). The first file in the array is always the primary
// image (UploadStep.tsx puts it first).
export async function createJob(req, res, next) {
  try {
    const productId = req.params.id;
    const product = await findProductById(productId);
    if (!product) throw new NotFoundError('Product not found');

    const files = req.files ?? [];
    if (files.length === 0) throw new AppError(400, 'A primary reference image is required');
    if (files.length > 4) throw new AppError(400, 'At most 1 primary + 3 supporting images are allowed');

    const existing = await findActiveJobByProduct(productId);
    if (existing) {
      return res.status(409).json({ error: { message: 'A job is already active for this product' }, jobId: existing.id });
    }

    for (const file of files) await validateImageFile(file);

    // Metadata stripped by the sharp re-encode; random key, no client-derived filename.
    const referenceImageUrls = [];
    for (const file of files) {
      const normalized = await sharp(file.buffer).jpeg({ quality: 92 }).toBuffer();
      const saved = await storageProvider.save(
        `products/ai-studio/${productId}/references/${crypto.randomUUID()}.jpeg`,
        normalized,
      );
      referenceImageUrls.push(saved.url);
    }

    let job;
    try {
      job = await insertJob({
        productId,
        referenceImageUrls,
        analysisModel: env.openaiVisionModel ?? null,
        imageModel: env.openaiImageModel,
      });
    } catch (err) {
      // Unique-violation race from the partial index (plan §8) — another
      // request created a job between our check above and this insert.
      if (err.code === '23505') {
        const active = await findActiveJobByProduct(productId);
        return res.status(409).json({ error: { message: 'A job is already active for this product' }, jobId: active?.id });
      }
      throw err;
    }

    await boss.send(JOB_AI_STUDIO_ANALYSE, {
      jobId: job.id,
      referenceKey: keyFromUrl(referenceImageUrls[0]),
      mimetype: 'image/jpeg',
    });

    res.status(202).json({ jobId: job.id });
  } catch (err) {
    next(err);
  }
}

// Lets the Studio page resume an in-progress job for a product instead of
// always starting at Upload — powers "Save as Draft" actually being
// resumable (the job just stays in whatever status it was left in).
export async function getActiveJob(req, res, next) {
  try {
    const job = await findActiveJobByProduct(req.params.id);
    res.json({ jobId: job?.id ?? null });
  } catch (err) {
    next(err);
  }
}

export async function getJob(req, res, next) {
  try {
    const job = await findJobById(req.params.jobId);
    if (!job || job.product_id !== req.params.id) throw new NotFoundError('Job not found');
    const assets = await findAssetsByJobId(job.id);
    const presenter = job.presenter_id ? await findPresenterById(job.presenter_id) : null;
    res.json({ job: jobDto(job, assets, presenter) });
  } catch (err) {
    next(err);
  }
}

// Category + (optional) presenter must be explicitly supplied here — even
// when analysis was confident, the admin's choice is what's used, never a
// silent fallback to the AI's guess (plan §5). jewelleryType excludes
// 'UNKNOWN' at the schema level, so an unresolved analysis can never reach
// generation without a real category being picked first. presenterId is
// nullable ("No Presenter" is a valid, explicit choice, not an omission).
export async function confirmJob(req, res, next) {
  try {
    const job = await findJobById(req.params.jobId);
    if (!job || job.product_id !== req.params.id) throw new NotFoundError('Job not found');
    if (job.status !== 'awaiting_confirmation') {
      throw new AppError(409, `Job is not awaiting confirmation (status: ${job.status})`);
    }

    const input = confirmSchema.parse(req.body);
    const template = await findCategoryTemplate(input.jewelleryType);
    if (!template) throw new AppError(400, `No generation template for "${input.jewelleryType}"`);

    let presenter = null;
    if (input.presenterId) {
      presenter = await findPresenterById(input.presenterId);
      if (!presenter || !presenter.is_active) throw new AppError(400, 'Selected presenter is not available');
      if (!presenter.supported_jewellery_types.includes(input.jewelleryType)) {
        throw new AppError(400, 'Selected presenter does not support this jewellery type');
      }
    }

    const generateRoseGold = input.generateRoseGold ?? true;

    await updateJob(job.id, {
      jewellery_type: input.jewelleryType,
      category_id: input.categoryId ?? null,
      presenter_id: input.presenterId ?? null,
      generate_rose_gold: generateRoseGold,
      confirmed_at: new Date(),
      status: 'generating',
    });

    const assetTypes = resolveAssetTypesForJob({ generateRoseGold, hasPresenter: !!presenter });
    await insertAssets(
      job.id,
      assetTypes.map((assetType) => ({ assetType, displayOrder: ASSET_DISPLAY_ORDER[assetType] })),
    );

    await boss.send(JOB_AI_STUDIO_GENERATE, { jobId: job.id });

    res.status(202).json({ jobId: job.id });
  } catch (err) {
    next(err);
  }
}

// Regenerate/retry — allowed on a FAILED asset (retry) or a READY one
// (Step 4/5's "Regenerate" action, letting the admin reroll a shot they
// don't like before moving on). Never on PENDING/GENERATING — those are
// already in flight.
export async function retryAsset(req, res, next) {
  try {
    const job = await findJobById(req.params.jobId);
    if (!job || job.product_id !== req.params.id) throw new NotFoundError('Job not found');
    if (!['review_ready', 'partially_failed'].includes(job.status)) {
      throw new AppError(409, `Job cannot be retried from status "${job.status}"`);
    }

    const asset = await findAssetById(req.params.assetId);
    if (!asset || asset.job_id !== job.id) throw new NotFoundError('Asset not found');
    if (!['FAILED', 'READY'].includes(asset.status)) {
      throw new AppError(409, 'Only a failed or completed asset can be regenerated');
    }

    await resetAssetForRetry(asset.id);
    await updateJob(job.id, { status: 'generating' });
    await boss.send(JOB_AI_STUDIO_GENERATE, { jobId: job.id, assetIds: [asset.id] });

    res.status(202).json({ jobId: job.id });
  } catch (err) {
    next(err);
  }
}

// Step 5's per-card select/deselect and "Set as Featured" actions. Setting
// isFeatured atomically clears every other asset in the job first, so
// exactly one stays featured — only a READY catalogue-type asset can be
// featured (mirrors the DB CHECK constraint).
export async function updateAssetSelection(req, res, next) {
  try {
    const job = await findJobById(req.params.jobId);
    if (!job || job.product_id !== req.params.id) throw new NotFoundError('Job not found');

    const asset = await findAssetById(req.params.assetId);
    if (!asset || asset.job_id !== job.id) throw new NotFoundError('Asset not found');

    const input = selectionSchema.parse(req.body);

    let updated = asset;
    if (input.isFeatured) {
      if (asset.status !== 'READY' || !CATALOGUE_ASSET_TYPES.includes(asset.asset_type)) {
        throw new AppError(400, 'Only a completed catalogue image can be set as featured');
      }
      updated = await withTransaction(async (client) => {
        await clearFeaturedForJobTx(client, job.id);
        return updateAssetTx(client, asset.id, { is_featured: true });
      });
    } else if (input.isFeatured === false) {
      updated = await updateAsset(asset.id, { is_featured: false });
    }
    if (input.selected !== undefined) {
      updated = await updateAsset(asset.id, { selected: input.selected });
    }

    res.json({ asset: assetDto(updated) });
  } catch (err) {
    next(err);
  }
}

export async function cancelJob(req, res, next) {
  try {
    const job = await findJobById(req.params.jobId);
    if (!job || job.product_id !== req.params.id) throw new NotFoundError('Job not found');
    if (['importing', 'completed', 'cancelled'].includes(job.status)) {
      throw new AppError(409, `Job cannot be cancelled from status "${job.status}"`);
    }
    // Reference images are never deleted here — only an explicit admin
    // delete removes them (plan §12). Any in-flight generation call checks
    // this status itself before writing back a result.
    await updateJob(job.id, { status: 'cancelled' });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
}

// Imports exactly one selected+READY+not-yet-imported asset — called
// per-asset by the frontend (sequentially, over every selected asset) so it
// can show a real completed/total progress percentage rather than a fake
// animated bar. Transactional and idempotent per-call: re-calling for an
// already-imported asset is a safe no-op.
export async function importAsset(req, res, next) {
  try {
    const productId = req.params.id;
    const jobId = req.params.jobId;

    const result = await withTransaction(async (client) => {
      const job = await lockJobById(client, jobId);
      if (!job || job.product_id !== productId) throw new NotFoundError('Job not found');
      if (!['review_ready', 'partially_failed', 'importing'].includes(job.status)) {
        throw new AppError(409, `Job is not ready to import (status: ${job.status})`);
      }

      const asset = await lockAssetByIdTx(client, req.params.assetId);
      if (!asset || asset.job_id !== jobId) throw new NotFoundError('Asset not found');
      if (asset.imported) return { alreadyImported: true, asset };
      if (!asset.selected) throw new AppError(400, 'Asset is not selected for import');
      if (asset.status !== 'READY') throw new AppError(409, 'Asset is not ready to import');

      if (job.status !== 'importing') await updateJobTx(client, jobId, { status: 'importing' });
      if (asset.is_featured) await clearPrimaryForProductTx(client, productId);

      const nextSortOrder = (await findMaxSortOrderTx(client, productId)) + 1;
      const raw = await storageProvider.read(asset.image_key);
      const variants = await processAndStoreImage(productId, raw);

      for (const v of variants) {
        await insertProductImageTx(client, {
          productId,
          type: 'AI_GENERATED',
          variant: v.variant,
          format: v.format,
          url: v.url,
          isPrimary: asset.is_featured,
          sortOrder: nextSortOrder,
        });
      }
      const updated = await updateAssetTx(client, asset.id, { imported: true });
      return { alreadyImported: false, asset: updated };
    });

    res.json({ imported: true, alreadyImported: result.alreadyImported, asset: assetDto(result.asset) });
  } catch (err) {
    next(err);
  }
}

// Finalizes the job once every selected asset has been imported via
// importAsset above — idempotent, callable more than once.
export async function completeImport(req, res, next) {
  try {
    const productId = req.params.id;
    const jobId = req.params.jobId;

    const job = await findJobById(jobId);
    if (!job || job.product_id !== productId) throw new NotFoundError('Job not found');
    if (job.status === 'completed') {
      const images = await findProductImages(productId);
      return res.json({ imported: true, alreadyCompleted: true, images });
    }
    if (job.status !== 'importing') {
      throw new AppError(409, `Job is not mid-import (status: ${job.status})`);
    }

    const assets = await findAssetsByJobId(jobId);
    const selected = assets.filter((a) => a.selected);
    if (selected.some((a) => !a.imported)) {
      throw new AppError(409, 'Not every selected image has been imported yet');
    }

    await updateJob(jobId, { status: 'completed', completed_at: new Date() });
    const images = await findProductImages(productId);
    res.json({ imported: true, alreadyCompleted: false, images });
  } catch (err) {
    next(err);
  }
}
