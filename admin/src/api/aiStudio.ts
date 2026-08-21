import { apiFetch, ApiError } from './client';
import type { GoldColor } from './types';

export type JewelleryType =
  | 'RING'
  | 'BRACELET'
  | 'BANGLE'
  | 'NECKLACE'
  | 'EARRINGS'
  | 'PENDANT'
  | 'CHAIN'
  | 'ANKLET'
  | 'NOSE_PIN'
  | 'MANGALSUTRA'
  | 'UNKNOWN';

export const REAL_JEWELLERY_TYPES: Exclude<JewelleryType, 'UNKNOWN'>[] = [
  'RING',
  'BRACELET',
  'BANGLE',
  'NECKLACE',
  'EARRINGS',
  'PENDANT',
  'CHAIN',
  'ANKLET',
  'NOSE_PIN',
  'MANGALSUTRA',
];

// Metal color is now encoded directly in the asset type (e.g. ROSE_FRONT)
// instead of being a separate per-job field — a job can produce both Yellow
// and Rose Gold shots side by side.
export type AssetType =
  | 'YELLOW_FRONT'
  | 'YELLOW_HERO_45'
  | 'ROSE_FRONT'
  | 'ROSE_HERO_45'
  | 'PRESENTER_YELLOW_1'
  | 'PRESENTER_YELLOW_2'
  | 'PRESENTER_ROSE';

export type AssetStatus = 'PENDING' | 'GENERATING' | 'READY' | 'FAILED';
export type StudioJobStatus =
  | 'draft'
  | 'uploading'
  | 'analysing'
  | 'awaiting_confirmation'
  | 'generating'
  | 'review_ready'
  | 'importing'
  | 'completed'
  | 'failed'
  | 'partially_failed'
  | 'cancelled';

export interface StudioAnalysis {
  jewelleryType: JewelleryType;
  jewelleryTypeConfidence: number;
  metalColor: GoldColor | null;
  metalColorConfidence: number;
  gemstone: string | null;
  gemstoneConfidence: number;
  dominantShape: string | null;
  shapeConfidence: number;
  suggestedCategorySlug: string | null;
}

export interface StudioAsset {
  id: string;
  assetType: AssetType;
  displayOrder: number;
  status: AssetStatus;
  imageUrl: string | null;
  qualityAssessment: unknown;
  selected: boolean;
  isFeatured: boolean;
  imported: boolean;
  retryCount: number;
  generationStartedAt: string | null;
  generationCompletedAt: string | null;
  error: string | null;
}

export interface StudioJob {
  id: string;
  productId: string;
  status: StudioJobStatus;
  referenceImageUrls: string[];
  analysis: StudioAnalysis | null;
  analysisConfidence: number | null;
  categoryConfidenceThreshold: number;
  jewelleryType: JewelleryType | null;
  categoryId: string | null;
  presenterId: string | null;
  presenter: { id: string; displayName: string; styleLabel: string } | null;
  generateRoseGold: boolean;
  error: string | null;
  createdAt: string;
  confirmedAt: string | null;
  completedAt: string | null;
  assets: StudioAsset[];
}

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4000/api/v1';

// Multipart upload, same reason every other image endpoint bypasses apiFetch.
// files[0] is always the primary reference image (UploadStep.tsx enforces this).
export async function createStudioJob(productId: string, files: File[]) {
  const formData = new FormData();
  for (const file of files) formData.append('images', file);

  const response = await fetch(`${API_BASE_URL}/admin/products/${productId}/ai-studio`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'X-Requested-With': 'box-diamonds' },
    body: formData,
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new ApiError(response.status, body.error?.message ?? response.statusText, body.error?.fields);
  }
  return response.json() as Promise<{ jobId: string }>;
}

// Resumes an in-progress job for a product instead of always starting at
// Upload — called once on the Studio page mount.
export function fetchActiveStudioJob(productId: string) {
  return apiFetch<{ jobId: string | null }>(`/admin/products/${productId}/ai-studio/active`);
}

export function fetchStudioJob(productId: string, jobId: string) {
  return apiFetch<{ job: StudioJob }>(`/admin/products/${productId}/ai-studio/${jobId}`);
}

export function confirmStudioJob(
  productId: string,
  jobId: string,
  input: {
    jewelleryType: Exclude<JewelleryType, 'UNKNOWN'>;
    categoryId: string | null;
    presenterId: string | null;
    generateRoseGold: boolean;
  },
) {
  return apiFetch<{ jobId: string }>(`/admin/products/${productId}/ai-studio/${jobId}/confirm`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

// Also used for Step 4/5's "Regenerate" action on a completed (READY) asset,
// not just a genuinely failed one — same endpoint, the backend now allows
// either starting status.
export function retryStudioAsset(productId: string, jobId: string, assetId: string) {
  return apiFetch<{ jobId: string }>(
    `/admin/products/${productId}/ai-studio/${jobId}/assets/${assetId}/retry`,
    { method: 'POST' },
  );
}

// Step 5's per-card select/deselect and "Set as Featured" actions.
export function updateStudioAssetSelection(
  productId: string,
  jobId: string,
  assetId: string,
  input: { selected?: boolean; isFeatured?: boolean },
) {
  return apiFetch<{ asset: StudioAsset }>(
    `/admin/products/${productId}/ai-studio/${jobId}/assets/${assetId}`,
    { method: 'PATCH', body: JSON.stringify(input) },
  );
}

// Imports one selected+ready asset — called sequentially over every selected
// asset by the frontend so it can show a real completed/total progress bar.
export function importStudioAsset(productId: string, jobId: string, assetId: string) {
  return apiFetch<{ imported: boolean; alreadyImported: boolean; asset: StudioAsset }>(
    `/admin/products/${productId}/ai-studio/${jobId}/assets/${assetId}/import`,
    { method: 'POST' },
  );
}

// Finalizes the job once every selected asset has been imported.
export function completeStudioImport(productId: string, jobId: string) {
  return apiFetch<{ imported: boolean; alreadyCompleted: boolean }>(
    `/admin/products/${productId}/ai-studio/${jobId}/import/complete`,
    { method: 'POST' },
  );
}

export function cancelStudioJob(productId: string, jobId: string) {
  return apiFetch<void>(`/admin/products/${productId}/ai-studio/${jobId}/cancel`, { method: 'POST' });
}
