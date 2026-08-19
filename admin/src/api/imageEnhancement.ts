import { ApiError } from './client';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4000/api/v1';

export interface EnhanceImageResult {
  image: string; // data: URI (image/webp, base64)
  mimeType: string;
}

// Multipart upload, same reason uploadProductImage() bypasses apiFetch — the
// browser needs to set its own multipart boundary in Content-Type.
export async function enhanceImage(file: File): Promise<EnhanceImageResult> {
  const formData = new FormData();
  formData.append('image', file);

  const response = await fetch(`${API_BASE_URL}/admin/image-enhancement`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'X-Requested-With': 'box-diamonds' },
    body: formData,
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new ApiError(response.status, body.error?.message ?? response.statusText, body.error?.fields);
  }
  return response.json();
}
