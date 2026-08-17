import { apiFetch } from './client';
import type { ReviewInput, ReviewListResponse } from './types';

export function fetchReviews(productId: string, page = 1, limit = 10) {
  return apiFetch<ReviewListResponse>(`/products/${productId}/reviews?page=${page}&limit=${limit}`);
}

export function submitReview(productId: string, input: ReviewInput) {
  return apiFetch<{ review: { id: string; status: string } }>(`/products/${productId}/reviews`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}
