import { apiFetch } from './client';
import type { Cart, VariantSelection } from './types';

export function fetchCart() {
  return apiFetch<Cart>('/cart');
}

export function addCartItem(productId: string, quantity = 1, variant?: VariantSelection) {
  return apiFetch<Cart>('/cart/items', {
    method: 'POST',
    body: JSON.stringify({
      productId,
      quantity,
      ...(variant?.sizeId ? { sizeId: variant.sizeId } : {}),
      ...(variant?.goldColor ? { goldColor: variant.goldColor } : {}),
      ...(variant?.purity ? { purity: variant.purity } : {}),
      ...(variant?.diamondConfigId ? { diamondConfigId: variant.diamondConfigId } : {}),
    }),
  });
}

function variantQuery(variant?: VariantSelection) {
  const qs = new URLSearchParams();
  if (variant?.sizeId) qs.set('sizeId', variant.sizeId);
  if (variant?.goldColor) qs.set('goldColor', variant.goldColor);
  if (variant?.purity) qs.set('purity', variant.purity);
  if (variant?.diamondConfigId) qs.set('diamondConfigId', variant.diamondConfigId);
  const s = qs.toString();
  return s ? `?${s}` : '';
}

export function updateCartItem(productId: string, quantity: number, variant?: VariantSelection) {
  return apiFetch<Cart>(`/cart/items/${productId}${variantQuery(variant)}`, {
    method: 'PATCH',
    body: JSON.stringify({ quantity }),
  });
}

export function removeCartItem(productId: string, variant?: VariantSelection) {
  return apiFetch<Cart>(`/cart/items/${productId}${variantQuery(variant)}`, { method: 'DELETE' });
}
