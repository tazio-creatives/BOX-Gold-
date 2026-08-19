import { apiFetch } from './client';
import type { Order, OrderStatus } from './types';

export interface OrderSummary {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  totalAmount: number;
  createdAt: string;
  itemCount: number;
  previewProductName: string | null;
  previewImageUrl: string | null;
  confirmedAt: string | null;
  shippedAt: string | null;
  deliveredAt: string | null;
}

export interface OrderListResponse {
  orders: OrderSummary[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface OrderStats {
  totalOrders: number;
  activeOrders: number;
  totalSpent: number;
}

export function fetchOrders(page = 1, limit = 10, status?: OrderStatus) {
  const qs = new URLSearchParams({ page: String(page), limit: String(limit) });
  if (status) qs.set('status', status);
  return apiFetch<OrderListResponse>(`/orders?${qs.toString()}`);
}

export function fetchOrderStats() {
  return apiFetch<OrderStats>('/orders/stats');
}

export function fetchOrderById(id: string) {
  return apiFetch<{ order: Order }>(`/orders/${id}`);
}
