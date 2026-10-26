import { apiFetch } from './client';
import type { SearchResults } from './types';

// Dropdown: the default 8 suggestions. Results page: a page of `limit`.
export function search(q: string, { page = 1, limit }: { page?: number; limit?: number } = {}) {
  const params = new URLSearchParams({ q });
  if (page > 1) params.set('page', String(page));
  if (limit) params.set('limit', String(limit));
  return apiFetch<SearchResults>(`/search?${params.toString()}`);
}
