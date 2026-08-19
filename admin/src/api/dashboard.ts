import { apiFetch } from './client';

export interface DashboardStats {
  totalOrders: number;
  totalRevenue: number;
  pendingPaymentCount: number;
  toFulfillCount: number;
  returnRequestedCount: number;
  ordersThisMonth: number;
  revenueThisMonth: number;
  totalProducts: number;
  activeProducts: number;
  totalCustomers: number;
  revenueTrend: { day: string; revenue: number }[];
}

export function fetchDashboardStats() {
  return apiFetch<DashboardStats>('/admin/dashboard/stats');
}
