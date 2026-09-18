import { AppError } from './AppError.js';

// The three split-status fields added by the 20260918000000 migration. See
// that migration's CHECK constraints for the authoritative value lists —
// these mirror them for validation/filtering in application code.
export const PAYMENT_STATUSES = ['PENDING', 'PAID', 'FAILED', 'REFUNDED'];

export const ORDER_STATUSES = [
  'CONFIRMED', 'PROCESSING', 'READY_TO_SHIP', 'SHIPPED', 'IN_TRANSIT',
  'OUT_FOR_DELIVERY', 'DELIVERED', 'DELAYED', 'DELIVERY_FAILED',
  'RETURN_INITIATED', 'RETURNED', 'CANCELLED',
];

export const SHIPMENT_STATUSES = [
  'NOT_CREATED', 'SHIPMENT_CREATED', 'PICKED_UP', 'IN_TRANSIT', 'REACHED_DESTINATION',
  'OUT_FOR_DELIVERY', 'DELIVERED', 'DELAYED', 'DELIVERY_FAILED', 'RTO_INITIATED',
  'RETURNED', 'CANCELLED',
];

// Two synthetic values covering an order that hasn't reached order_status
// yet (payment_status PENDING/FAILED, order_status still NULL) — used only
// by the admin Orders list filter dropdown, never written to order_status
// itself.
export const STATUS_FILTER_VALUES = ['PENDING_PAYMENT', 'PAYMENT_FAILED', ...ORDER_STATUSES];

export const TERMINAL_ORDER_STATUSES = ['DELIVERED', 'CANCELLED', 'RETURNED'];

// Courier-controlled statuses aren't reachable through the generic admin
// override — READY_TO_SHIP requires the Ready-to-Ship validation+Delhivery
// flow (Phase 3), and SHIPPED/IN_TRANSIT/OUT_FOR_DELIVERY/DELIVERED are
// meant to be tracking-driven once a shipment exists (spec §7: "Courier-
// controlled statuses must not be manually changed by ordinary admins").
// PROCESSING is also reachable via the dedicated start-processing action;
// kept here too so the generic endpoint can still be used for it directly.
export const ADMIN_MANUAL_TARGETS = [
  'PROCESSING', 'CANCELLED', 'DELAYED', 'DELIVERY_FAILED', 'RETURN_INITIATED', 'RETURNED',
];

// The legacy `status` column's CHECK constraint (orders.js, unchanged since
// creation) only allows its own original 11 values — new order_status
// values with no legacy equivalent are simply not mirrored onto it. `status`
// is a frozen best-effort legacy view during the transition, not a strict
// twin of order_status going forward.
export const ORDER_STATUS_TO_LEGACY_STATUS = {
  CONFIRMED: 'CONFIRMED',
  PROCESSING: 'PROCESSING',
  SHIPPED: 'SHIPPED',
  OUT_FOR_DELIVERY: 'OUT_FOR_DELIVERY',
  DELIVERED: 'DELIVERED',
  CANCELLED: 'CANCELLED',
  RETURN_INITIATED: 'RETURN_REQUESTED',
  RETURNED: 'REFUNDED',
  // READY_TO_SHIP, IN_TRANSIT, DELAYED, DELIVERY_FAILED: no legacy equivalent.
};

export function assertManualTransitionAllowed(currentOrderStatus, targetOrderStatus) {
  if (!currentOrderStatus) {
    throw new AppError(400, 'Order has no fulfilment status yet — payment has not been confirmed');
  }
  if (TERMINAL_ORDER_STATUSES.includes(currentOrderStatus)) {
    throw new AppError(400, `Order is already ${currentOrderStatus} and cannot be changed`);
  }
  if (!ADMIN_MANUAL_TARGETS.includes(targetOrderStatus)) {
    throw new AppError(400, `${targetOrderStatus} cannot be set manually`);
  }
}
