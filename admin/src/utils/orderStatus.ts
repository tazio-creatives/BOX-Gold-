import type { OrderStatus } from '../api/types';

export const ORDER_STATUSES: OrderStatus[] = [
  'PENDING_PAYMENT',
  'CONFIRMED',
  'PROCESSING',
  'SHIPPED',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
  'PAYMENT_FAILED',
  'EXPIRED',
  'CANCELLED',
  'RETURN_REQUESTED',
  'REFUNDED',
];

export const ORDER_STATUS_BADGE_CLASS: Record<string, string> = {
  DELIVERED: 'badgeSuccess',
  CONFIRMED: 'badgeSuccess',
  PROCESSING: 'badgeSuccess',
  SHIPPED: 'badgeSuccess',
  OUT_FOR_DELIVERY: 'badgeSuccess',
  PENDING_PAYMENT: 'badgeWarning',
  PAYMENT_FAILED: 'badgeDanger',
  EXPIRED: 'badgeDanger',
  CANCELLED: 'badgeDanger',
  RETURN_REQUESTED: 'badgeWarning',
};

export function formatOrderStatus(status: string) {
  return status
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
