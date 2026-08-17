import { apiFetch } from './client';
import type { ProductDetail, ProductInput, ProductListItem, ProductStatus } from './types';

export interface ListProductsParams {
  status?: ProductStatus;
  category?: string;
  metal?: string;
  purity?: string;
  page?: number;
  limit?: number;
}

export interface ProductListResponse {
  products: ProductListItem[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export function fetchAdminProducts(params: ListProductsParams) {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') qs.set(key, String(value));
  }
  const suffix = qs.toString();
  return apiFetch<ProductListResponse>(`/admin/products${suffix ? `?${suffix}` : ''}`);
}

export function fetchAdminProduct(id: string) {
  return apiFetch<{ product: ProductDetail }>(`/admin/products/${id}`);
}

export function createProduct(input: ProductInput) {
  return apiFetch<{ product: ProductDetail }>('/admin/products', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function updateProduct(id: string, input: Partial<ProductInput>) {
  return apiFetch<{ product: ProductDetail }>(`/admin/products/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export function deleteProduct(id: string) {
  return apiFetch<void>(`/admin/products/${id}`, { method: 'DELETE' });
}

export function setPriceLock(id: string, locked: boolean) {
  return apiFetch<{ id: string; isPriceLocked: boolean }>(`/admin/products/${id}/price-lock`, {
    method: 'PATCH',
    body: JSON.stringify({ locked }),
  });
}

export function setFeatured(id: string, featured: boolean) {
  return apiFetch<{ id: string; isFeatured: boolean }>(`/admin/products/${id}/featured`, {
    method: 'PATCH',
    body: JSON.stringify({ featured }),
  });
}
