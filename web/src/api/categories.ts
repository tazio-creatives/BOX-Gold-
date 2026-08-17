import { apiFetch } from './client';
import type { Category, CategoryFilterCounts } from './types';

export function fetchCategories() {
  return apiFetch<{ categories: Category[] }>('/categories');
}

export function fetchCategoryBySlug(slug: string) {
  return apiFetch<{ category: Category }>(`/categories/${slug}`);
}

export function fetchCategoryFilterCounts(slug: string) {
  return apiFetch<CategoryFilterCounts>(`/categories/${slug}/counts`);
}
