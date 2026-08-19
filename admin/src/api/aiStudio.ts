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

export type PresenterStyle = 'CONTEMPORARY' | 'TRADITIONAL';
export type ShotType = 'FRONT' | 'HERO_45' | 'PRESENTER' | 'LIFESTYLE';
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
  shotType: ShotType;
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
  metalColor: GoldColor | null;
  presenterStyle: PresenterStyle | null;
  error: string | null;
  createdAt: string;
  confirmedAt: string | null;
  completedAt: string | null;
  assets: StudioAsset[];
}

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4000/api/v1';

// Multipart upload, same reason every other image endpoint bypasses apiFetch.
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

export function fetchStudioJob(productId: string, jobId: string) {
  return apiFetch<{ job: StudioJob }>(`/admin/products/${productId}/ai-studio/${jobId}`);
}

export function confirmStudioJob(
  productId: string,
  jobId: string,
  input: {
    jewelleryType: Exclude<JewelleryType, 'UNKNOWN'>;
    categoryId: string | null;
    metalColor: GoldColor | null;
    presenterStyle: PresenterStyle;
  },
) {
  return apiFetch<{ jobId: string }>(`/admin/products/${productId}/ai-studio/${jobId}/confirm`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function retryStudioAsset(productId: string, jobId: string, assetId: string) {
  return apiFetch<{ jobId: string }>(
    `/admin/products/${productId}/ai-studio/${jobId}/assets/${assetId}/retry`,
    { method: 'POST' },
  );
}

export function importStudioJob(productId: string, jobId: string) {
  return apiFetch<{ imported: boolean }>(`/admin/products/${productId}/ai-studio/${jobId}/import`, {
    method: 'POST',
  });
}

export function cancelStudioJob(productId: string, jobId: string) {
  return apiFetch<void>(`/admin/products/${productId}/ai-studio/${jobId}/cancel`, { method: 'POST' });
}
