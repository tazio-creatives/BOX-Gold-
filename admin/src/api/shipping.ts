import { apiFetch } from './client';
import type { Shipment } from './types';

export function shipOrder(orderId: string) {
  return apiFetch<{ shipment: Shipment }>(`/admin/shipping/orders/${orderId}/ship`, {
    method: 'POST',
  });
}

export function cancelShipment(orderId: string) {
  return apiFetch<{ shipment: Shipment }>(`/admin/shipping/orders/${orderId}/cancel-shipment`, {
    method: 'POST',
  });
}

// Dev-only — see backend shippingService.simulateTrackingUpdate.
export function simulateTracking(orderId: string, status: 'OUT_FOR_DELIVERY' | 'DELIVERED') {
  return apiFetch<{ shipment: Shipment }>(`/admin/shipping/orders/${orderId}/simulate-tracking`, {
    method: 'POST',
    body: JSON.stringify({ status }),
  });
}
