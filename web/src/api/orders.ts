import { apiFetch } from './client';
import type { Order, OrderStatus } from './types';

export interface OrderSummary {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  totalAmount: number;
  createdAt: string;
}

export interface OrderListResponse {
  orders: OrderSummary[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export function fetchOrders(page = 1, limit = 10) {
  return apiFetch<OrderListResponse>(`/orders?page=${page}&limit=${limit}`);
}

export function fetchOrderById(id: string) {
  return apiFetch<{ order: Order }>(`/orders/${id}`);
}
