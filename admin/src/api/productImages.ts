import { apiFetch, ApiError } from './client';

export interface ImageVariant {
  variant: string;
  format: string;
  url: string;
}

export type ImageGoldColour = 'YELLOW' | 'ROSE' | 'WHITE' | 'ANY';
export type ImageShotType = 'FRONT' | 'ANGLE' | 'SIDE' | 'MACRO' | 'MODEL' | 'SIZE_GUIDE' | 'OTHER';

// Which gold colour a photo shows ('ANY' = colour-neutral) and what kind of
// shot it is — drives which photo the cart/orders show for each colour.
export interface ImageLabels {
  goldColour: ImageGoldColour;
  shotType: ImageShotType;
}

export interface ImageGroup {
  sortOrder: number;
  type: 'ORIGINAL' | 'AI_GENERATED' | 'PRODUCT_SIZE';
  isPrimary: boolean;
  goldColour: ImageGoldColour;
  shotType: ImageShotType;
  variants: ImageVariant[];
}

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4000/api/v1';

export function fetchProductImages(productId: string) {
  // offeredGoldColours: the gold colours this product is sold in — more than
  // one means a manual photo must be given a colour before it's added.
  return apiFetch<{ images: ImageGroup[]; offeredGoldColours: Array<'YELLOW' | 'ROSE' | 'WHITE'> }>(
    `/admin/products/${productId}/images`,
  );
}

// Multipart upload — can't go through the JSON-only apiFetch helper (the
// browser needs to set its own multipart boundary in Content-Type).
export async function uploadProductImage(productId: string, file: File, labels?: ImageLabels) {
  const formData = new FormData();
  if (labels) {
    formData.append('goldColour', labels.goldColour);
    formData.append('shotType', labels.shotType);
  }
  formData.append('image', file);

  const response = await fetch(`${API_BASE_URL}/admin/products/${productId}/images`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'X-Requested-With': 'box-diamonds' },
    body: formData,
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new ApiError(response.status, body.error?.message ?? response.statusText, body.error?.fields);
  }
  return response.json() as Promise<{ images: ImageGroup[] }>;
}

export function setPrimaryImage(productId: string, sortOrder: number) {
  return apiFetch<{ images: ImageGroup[] }>(`/admin/products/${productId}/images/${sortOrder}/primary`, {
    method: 'PATCH',
  });
}

export function reorderImages(productId: string, order: number[]) {
  return apiFetch<{ images: ImageGroup[] }>(`/admin/products/${productId}/images/reorder`, {
    method: 'PATCH',
    body: JSON.stringify({ order }),
  });
}

export function deleteProductImage(productId: string, sortOrder: number) {
  return apiFetch<void>(`/admin/products/${productId}/images/${sortOrder}`, { method: 'DELETE' });
}

export interface LibraryImage {
  productId: string;
  productName: string;
  sortOrder: number;
  thumbnailUrl: string | null;
  isPrimary: boolean;
}

// Gallery-wide picker — one thumbnail per image group across every product,
// so an admin can reuse an existing photo instead of re-uploading it.
export function fetchImageLibrary(params: { search?: string; excludeProductId?: string } = {}) {
  const qs = new URLSearchParams();
  if (params.search) qs.set('search', params.search);
  if (params.excludeProductId) qs.set('excludeProductId', params.excludeProductId);
  const suffix = qs.toString() ? `?${qs.toString()}` : '';
  return apiFetch<{ images: LibraryImage[] }>(`/admin/products/images/library${suffix}`);
}

export function attachExistingImage(
  productId: string,
  source: { sourceProductId: string; sourceSortOrder: number },
  labels?: ImageLabels,
) {
  return apiFetch<{ images: ImageGroup[] }>(`/admin/products/${productId}/images/attach`, {
    method: 'POST',
    body: JSON.stringify({ ...source, ...labels }),
  });
}

export function updateImageLabels(productId: string, sortOrder: number, labels: ImageLabels) {
  return apiFetch<{ images: ImageGroup[] }>(`/admin/products/${productId}/images/${sortOrder}/labels`, {
    method: 'PATCH',
    body: JSON.stringify(labels),
  });
}
