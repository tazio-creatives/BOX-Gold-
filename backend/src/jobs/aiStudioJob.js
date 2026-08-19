import crypto from 'node:crypto';
import { boss } from './queue.js';
import { env } from '../config/env.js';
import { storageProvider } from '../providers/storage/index.js';
import { analyseJewellery, generateShot } from '../services/aiStudioService.js';
import {
  findJobById,
  updateJob,
  findAssetsByJobId,
  updateAsset,
  findCategoryTemplate,
} from '../repositories/aiStudio.repository.js';

export const JOB_AI_STUDIO_ANALYSE = 'ai-studio-analyse';
export const JOB_AI_STUDIO_GENERATE = 'ai-studio-generate';

function keyFromUrl(url) {
  return new URL(url).pathname.replace(/^\/uploads\//, '');
}

// pg-boss v10's work() callback receives an array of jobs (batch fetch) even
// though boss.send() always enqueues one at a time — same gotcha as every
// other job handler in this codebase (pricingJobs.js, aiImageJob.js).
async function analyseHandler(jobs) {
  const [job] = jobs;
  const { jobId, referenceKey, mimetype } = job.data;

  try {
    const buffer = await storageProvider.read(referenceKey);
    const analysis = await analyseJewellery(buffer, mimetype);
    await updateJob(jobId, {
      status: 'awaiting_confirmation',
      analysis: JSON.stringify(analysis),
      analysis_confidence: analysis.jewelleryTypeConfidence,
    });
  } catch (err) {
    await updateJob(jobId, { status: 'failed', error: err.message });
  }
}

// Runs `fn` over `items` with at most `limit` in flight at once — 4 items,
// max concurrency 4 by default, but configurable/boundable without pulling
// in a dependency for what's a tiny fixed-size worker pool.
async function runWithConcurrency(items, limit, fn) {
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const item = items[cursor++];
      await fn(item);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}

export function deriveJobStatus(assets) {
  const readyCount = assets.filter((a) => a.status === 'READY').length;
  const failedCount = assets.filter((a) => a.status === 'FAILED').length;
  if (readyCount === assets.length) return 'review_ready';
  if (readyCount > 0 && failedCount > 0) return 'partially_failed';
  if (failedCount === assets.length) return 'failed';
  return null; // still in flight
}

async function generateOneAsset({ jobId, asset, referenceBuffer, mimetype, template, metalColor, presenterStyle, imageModel }) {
  // A cancelled job's late-arriving results are discarded, never written
  // back (plan §12) — checked immediately before each write, not just once
  // up front, since cancellation can land mid-flight.
  const current = await findJobById(jobId);
  if (current.status === 'cancelled') return;

  await updateAsset(asset.id, { status: 'GENERATING', generation_started_at: new Date() });

  try {
    const { buffer, prompt } = await generateShot({
      referenceBuffer,
      mimetype,
      template,
      shotType: asset.shot_type,
      metalColor,
      presenterStyle,
    });

    const stillActive = await findJobById(jobId);
    if (stillActive.status === 'cancelled') return;

    const saved = await storageProvider.save(
      `products/ai-studio/${jobId}/${crypto.randomUUID()}.png`,
      buffer,
    );
    await updateAsset(asset.id, {
      status: 'READY',
      image_key: saved.key,
      generation_metadata: JSON.stringify({ prompt, imageModel }),
      generation_completed_at: new Date(),
      is_featured: asset.shot_type === 'FRONT',
    });
  } catch (err) {
    const stillActive = await findJobById(jobId);
    if (stillActive.status === 'cancelled') return;
    await updateAsset(asset.id, {
      status: 'FAILED',
      error: err.message,
      generation_completed_at: new Date(),
      retry_count: asset.retry_count + 1,
    });
  }
}

async function generateHandler(jobs) {
  const [job] = jobs;
  const { jobId, assetIds } = job.data;

  const aiStudioJob = await findJobById(jobId);
  if (!aiStudioJob || aiStudioJob.status === 'cancelled') return;

  try {
    const template = await findCategoryTemplate(aiStudioJob.jewellery_type);
    if (!template) throw new Error(`No category template for "${aiStudioJob.jewellery_type}"`);

    const referenceUrls = aiStudioJob.reference_image_urls;
    const referenceBuffer = await storageProvider.read(keyFromUrl(referenceUrls[0]));
    const mimetype = 'image/jpeg';

    const allAssets = await findAssetsByJobId(jobId);
    const targets = assetIds
      ? allAssets.filter((a) => assetIds.includes(a.id))
      : allAssets.filter((a) => a.status === 'PENDING');

    await runWithConcurrency(targets, env.aiStudioGenerationConcurrency, (asset) =>
      generateOneAsset({
        jobId,
        asset,
        referenceBuffer,
        mimetype,
        template,
        metalColor: aiStudioJob.metal_color,
        presenterStyle: aiStudioJob.presenter_style,
        imageModel: env.openaiImageModel,
      }),
    );

    const refreshedJob = await findJobById(jobId);
    if (refreshedJob.status === 'cancelled') return;

    const refreshedAssets = await findAssetsByJobId(jobId);
    const derived = deriveJobStatus(refreshedAssets);
    if (derived) await updateJob(jobId, { status: derived });
  } catch (err) {
    await updateJob(jobId, { status: 'failed', error: err.message });
  }
}

export async function registerAiStudioWorker() {
  await boss.createQueue(JOB_AI_STUDIO_ANALYSE);
  // Default pg-boss job expiry is 15 minutes — too tight here. A single
  // generateShot() call has been measured up to ~490s, and with one retry
  // (see aiStudioService.js) plus up to 4 shots each independently able to
  // hit that worst case, 30 minutes gives real headroom before pg-boss would
  // mark the job expired and risk a duplicate concurrent run.
  await boss.createQueue(JOB_AI_STUDIO_GENERATE, { expireInMinutes: 30 });
  await boss.work(JOB_AI_STUDIO_ANALYSE, analyseHandler);
  await boss.work(JOB_AI_STUDIO_GENERATE, generateHandler);
}

// Exported for the retry endpoint, which needs to reset one asset back to
// PENDING before re-enqueuing generation scoped to just that asset id.
export async function resetAssetForRetry(assetId) {
  return updateAsset(assetId, { status: 'PENDING', error: null });
}
