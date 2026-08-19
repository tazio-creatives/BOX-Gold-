import crypto from 'node:crypto';
import sharp from 'sharp';
import { z } from 'zod';
import { AppError, NotFoundError } from '../utils/AppError.js';
import { env } from '../config/env.js';
import { boss } from '../jobs/queue.js';
import { JOB_AI_STUDIO_ANALYSE, JOB_AI_STUDIO_GENERATE, resetAssetForRetry } from '../jobs/aiStudioJob.js';
import { JEWELLERY_TYPES } from '../services/aiStudioService.js';
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
  updateAssetTx,
  findMaxSortOrderTx,
  clearPrimaryForProductTx,
  insertProductImageTx,
} from '../repositories/aiStudio.repository.js';

const MIN_DIMENSION_PX = 200;
const MAX_DIMENSION_PX = 8000;
const SHOT_TYPES = ['FRONT', 'HERO_45', 'PRESENTER', 'LIFESTYLE'];

export const confirmSchema = z.object({
  jewelleryType: z.enum(JEWELLERY_TYPES.filter((t) => t !== 'UNKNOWN')),
  categoryId: z.string().uuid().nullable().optional(),
  metalColor: z.enum(['YELLOW', 'ROSE', 'WHITE']).nullable().optional(),
  presenterStyle: z.enum(['CONTEMPORARY', 'TRADITIONAL']),
});

function keyFromUrl(url) {
  return new URL(url).pathname.replace(/^\/uploads\//, '');
}

// API responses never include raw storage keys, prompts, or generation
// internals (plan §11) — only public URLs and safe status fields.
function assetDto(asset) {
  return {
    id: asset.id,
    shotType: asset.shot_type,
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

function jobDto(job, assets) {
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
    metalColor: job.metal_color,
    presenterStyle: job.presenter_style,
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

// Upload 1-4 reference photos, create the job, kick off analysis. Rejects
// with 409 (returning the existing job id) if one is already active for
// this product — enforced here and by the partial unique index, so a
// double-click race still fails cleanly rather than 500ing (plan §8).
export async function createJob(req, res, next) {
  try {
    const productId = req.params.id;
    const product = await findProductById(productId);
    if (!product) throw new NotFoundError('Product not found');

    const files = req.files ?? [];
    if (files.length === 0) throw new AppError(400, 'At least one reference image is required');
    if (files.length > 4) throw new AppError(400, 'At most 4 reference images are allowed');

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

export async function getJob(req, res, next) {
  try {
    const job = await findJobById(req.params.jobId);
    if (!job || job.product_id !== req.params.id) throw new NotFoundError('Job not found');
    const assets = await findAssetsByJobId(job.id);
    res.json({ job: jobDto(job, assets) });
  } catch (err) {
    next(err);
  }
}

// Category + metal + presenter must ALL be explicitly supplied here — even
// when analysis was confident, the admin's choice is what's used, never a
// silent fallback to the AI's guess (plan §5). jewelleryType excludes
// 'UNKNOWN' at the schema level, so an unresolved analysis can never reach
// generation without a real category being picked first.
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

    await updateJob(job.id, {
      jewellery_type: input.jewelleryType,
      category_id: input.categoryId ?? null,
      metal_color: input.metalColor ?? null,
      presenter_style: input.presenterStyle,
      confirmed_at: new Date(),
      status: 'generating',
    });

    await insertAssets(
      job.id,
      SHOT_TYPES.map((shotType, i) => ({ shotType, displayOrder: i })),
    );

    await boss.send(JOB_AI_STUDIO_GENERATE, { jobId: job.id });

    res.status(202).json({ jobId: job.id });
  } catch (err) {
    next(err);
  }
}

export async function retryAsset(req, res, next) {
  try {
    const job = await findJobById(req.params.jobId);
    if (!job || job.product_id !== req.params.id) throw new NotFoundError('Job not found');
    if (!['review_ready', 'partially_failed'].includes(job.status)) {
      throw new AppError(409, `Job cannot be retried from status "${job.status}"`);
    }

    const asset = await findAssetById(req.params.assetId);
    if (!asset || asset.job_id !== job.id) throw new NotFoundError('Asset not found');
    if (asset.status !== 'FAILED') throw new AppError(409, 'Only a failed asset can be retried');

    await resetAssetForRetry(asset.id);
    await updateJob(job.id, { status: 'generating' });
    await boss.send(JOB_AI_STUDIO_GENERATE, { jobId: job.id, assetIds: [asset.id] });

    res.status(202).json({ jobId: job.id });
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

// Transactional and idempotent (plan §7/§11): locks the job row, replays
// cleanly if already completed, skips any asset already imported, and never
// deletes/requires regenerating anything on failure — the whole operation is
// safe to just call again.
export async function importJob(req, res, next) {
  try {
    const productId = req.params.id;
    const jobId = req.params.jobId;

    const result = await withTransaction(async (client) => {
      const job = await lockJobById(client, jobId);
      if (!job || job.product_id !== productId) throw new NotFoundError('Job not found');

      if (job.status === 'completed') {
        return { alreadyCompleted: true };
      }
      if (!['review_ready', 'importing'].includes(job.status)) {
        throw new AppError(409, `Job is not ready to import (status: ${job.status})`);
      }

      const assets = await findAssetsByJobIdTx(client, jobId);
      const selected = assets.filter((a) => a.selected);
      if (selected.some((a) => a.status !== 'READY')) {
        throw new AppError(409, 'All selected images must be ready before importing');
      }

      await updateJobTx(client, jobId, { status: 'importing' });

      let nextSortOrder = (await findMaxSortOrderTx(client, productId)) + 1;
      const frontPending = selected.find((a) => a.shot_type === 'FRONT' && !a.imported);
      if (frontPending) await clearPrimaryForProductTx(client, productId);

      for (const asset of selected.sort((a, b) => a.display_order - b.display_order)) {
        if (asset.imported) continue;

        const raw = await storageProvider.read(asset.image_key);
        const variants = await processAndStoreImage(productId, raw);
        const sortOrder = nextSortOrder++;

        for (const v of variants) {
          await insertProductImageTx(client, {
            productId,
            type: 'AI_GENERATED',
            variant: v.variant,
            format: v.format,
            url: v.url,
            isPrimary: asset.shot_type === 'FRONT',
            sortOrder,
          });
        }
        await updateAssetTx(client, asset.id, { imported: true });
      }

      const completedJob = await updateJobTx(client, jobId, { status: 'completed', completed_at: new Date() });
      return { alreadyCompleted: false, job: completedJob };
    });

    const images = await findProductImages(productId);
    res.json({ imported: true, alreadyCompleted: result.alreadyCompleted, images });
  } catch (err) {
    next(err);
  }
}
