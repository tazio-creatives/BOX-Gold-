import { getDashboardStats } from '../repositories/dashboard.repository.js';

export async function getStats(req, res, next) {
  try {
    const stats = await getDashboardStats();
    res.json({
      totalOrders: stats.total_orders,
      totalRevenue: Number(stats.total_revenue),
      pendingPaymentCount: stats.pending_payment_count,
      toFulfillCount: stats.to_fulfill_count,
      returnRequestedCount: stats.return_requested_count,
      ordersThisMonth: stats.orders_this_month,
      revenueThisMonth: Number(stats.revenue_this_month),
      totalProducts: stats.total_products,
      activeProducts: stats.active_products,
      totalCustomers: stats.total_customers,
      revenueTrend: stats.revenueTrend.map((row) => ({
        day: row.day,
        revenue: Number(row.revenue),
      })),
    });
  } catch (err) {
    next(err);
  }
}
