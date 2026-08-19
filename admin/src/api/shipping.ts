import { apiFetch } from './client';
import type { Shipment, ShipmentTrackingEvent } from './types';

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

export interface AddTrackingEventInput {
  status: string;
  location?: string;
  note?: string;
}

export function addTrackingEvent(orderId: string, input: AddTrackingEventInput) {
  return apiFetch<{ event: ShipmentTrackingEvent }>(`/admin/shipping/orders/${orderId}/tracking-events`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}
