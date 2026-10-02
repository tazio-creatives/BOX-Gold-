import { apiFetch } from './client';
import type { DiamondType, DiamondTypeInput } from './types';

export function fetchDiamondTypes(opts: { activeOnly?: boolean } = {}) {
  const qs = opts.activeOnly ? '?activeOnly=true' : '';
  return apiFetch<{ diamondTypes: DiamondType[] }>(`/admin/pricing/diamond-types${qs}`);
}

export function createDiamondType(input: DiamondTypeInput) {
  return apiFetch<{ diamondType: DiamondType }>('/admin/pricing/diamond-types', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function updateDiamondType(id: string, input: Partial<DiamondTypeInput>) {
  return apiFetch<{ diamondType: DiamondType }>(`/admin/pricing/diamond-types/${id}`, {
    method: 'PUT',
    body: JSON.stringify(input),
  });
}
