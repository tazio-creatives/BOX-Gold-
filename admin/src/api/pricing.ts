import { apiFetch } from './client';
import type {
  GoldRateAdjustmentType,
  GoldRateOverview,
  GoldRateRow,
  GoldRateSettingsRow,
  GoldRateSource,
  MetalType,
  PricingPreviewResult,
  Purity,
} from './types';

export interface PricingPreviewInput {
  metalType: MetalType;
  purity?: Purity | null;
  goldWeightGrams?: number | null;
  diamondWeightCarats?: number | null;
  diamondConfigId?: string | null;
  makingCharge?: number;
  gstPercent?: number;
}

export function previewPricing(input: PricingPreviewInput) {
  return apiFetch<PricingPreviewResult>('/admin/pricing/preview', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function fetchGoldRates() {
  return apiFetch<{ current: GoldRateRow[]; history: GoldRateRow[]; total: number }>(
    '/admin/pricing/gold-rates',
  );
}

// Enqueues the same background job the scheduled sync uses — the rows this
// returns won't reflect the new rate yet, only that the job was queued.
export function syncGoldRates() {
  return apiFetch<{ message: string }>('/admin/pricing/gold-rates/sync', { method: 'POST' });
}

export function fetchGoldRateOverview() {
  return apiFetch<GoldRateOverview>('/admin/pricing/gold-rate-settings');
}

export interface GoldRateSettingsInput {
  source?: GoldRateSource;
  adjustmentType?: GoldRateAdjustmentType;
  adjustmentValue?: number;
  maxDeviationPercent?: number;
}

export function updateGoldRateSettings(input: GoldRateSettingsInput) {
  return apiFetch<GoldRateSettingsRow>('/admin/pricing/gold-rate-settings', {
    method: 'PUT',
    body: JSON.stringify(input),
  });
}

export function setManualGoldRate(rate24k: number) {
  return apiFetch<{ rates: GoldRateRow[] }>('/admin/pricing/gold-rate-settings/manual-rate', {
    method: 'POST',
    body: JSON.stringify({ rate24k }),
  });
}
