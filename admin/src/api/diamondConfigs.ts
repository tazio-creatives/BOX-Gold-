import { apiFetch } from './client';
import type { DiamondConfig } from './types';

export interface DiamondConfigInput {
  name: string;
  ratePerCent: number;
  isActive?: boolean;
}

export function fetchDiamondConfigs(opts: { activeOnly?: boolean } = {}) {
  const qs = opts.activeOnly ? '?activeOnly=true' : '';
  return apiFetch<{ diamondConfigs: DiamondConfig[] }>(`/admin/pricing/diamond-configs${qs}`);
}

export function createDiamondConfig(input: DiamondConfigInput) {
  return apiFetch<{ diamondConfig: DiamondConfig }>('/admin/pricing/diamond-configs', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function updateDiamondConfig(id: string, input: Partial<DiamondConfigInput>) {
  return apiFetch<{ diamondConfig: DiamondConfig }>(`/admin/pricing/diamond-configs/${id}`, {
    method: 'PUT',
    body: JSON.stringify(input),
  });
}

export function deleteDiamondConfig(id: string) {
  return apiFetch<void>(`/admin/pricing/diamond-configs/${id}`, { method: 'DELETE' });
}
