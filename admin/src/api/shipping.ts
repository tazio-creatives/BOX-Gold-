import { apiFetch } from './client';
import type { Shipment, ShipmentTrackingEvent } from './types';

export interface ReadyToShipInput {
  weightGrams: number;
  lengthCm: number;
  widthCm: number;
  heightCm: number;
}

export function markReadyToShip(orderId: string, input: ReadyToShipInput) {
  return apiFetch<{ shipment: Shipment }>(`/admin/shipping/orders/${orderId}/ready-to-ship`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function cancelShipment(orderId: string) {
  return apiFetch<{ shipment: Shipment }>(`/admin/shipping/orders/${orderId}/cancel-shipment`, {
    method: 'POST',
  });
}

// Pulls the courier's current status for this order's shipment on demand,
// instead of waiting for the next scheduled sync run.
export function syncTracking(orderId: string) {
  return apiFetch<{ shipment: Shipment }>(`/admin/shipping/orders/${orderId}/sync-tracking`, {
    method: 'POST',
  });
}

// Retries the label/packing-slip PDF fetch — covers the case where the
// automatic fetch right after shipment creation failed or wasn't ready yet.
export function fetchLabel(orderId: string) {
  return apiFetch<{ shipment: Shipment }>(`/admin/shipping/orders/${orderId}/fetch-label`, {
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
