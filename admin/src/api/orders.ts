import { apiFetch } from './client';
import type { OrderDetail, OrderListItem, OrderStatus } from './types';

export interface OrderListResponse {
  orders: OrderListItem[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export function fetchAdminOrders(status?: OrderStatus, page = 1, limit = 20) {
  const qs = new URLSearchParams({ page: String(page), limit: String(limit) });
  if (status) qs.set('status', status);
  return apiFetch<OrderListResponse>(`/admin/orders?${qs.toString()}`);
}

export function fetchAdminOrder(id: string) {
  return apiFetch<{ order: OrderDetail }>(`/admin/orders/${id}`);
}
