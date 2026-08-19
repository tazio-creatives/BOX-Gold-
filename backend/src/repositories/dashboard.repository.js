import { query } from '../config/db.js';

// Orders that never resulted in a real charge — excluded from revenue, same
// definition already used for a customer's "Total Spent" (orders.repository.js).
const UNSPENT_STATUSES = ['PENDING_PAYMENT', 'PAYMENT_FAILED', 'EXPIRED', 'CANCELLED'];

export async function getDashboardStats() {
  const [orderStats, productStats, customerStats, revenueTrend] = await Promise.all([
    query(
      `SELECT
         COUNT(*)::int AS total_orders,
         COALESCE(SUM(total_amount) FILTER (WHERE status != ALL($1)), 0) AS total_revenue,
         COUNT(*) FILTER (WHERE status = 'PENDING_PAYMENT')::int AS pending_payment_count,
         COUNT(*) FILTER (WHERE status IN ('CONFIRMED', 'PROCESSING'))::int AS to_fulfill_count,
         COUNT(*) FILTER (WHERE status = 'RETURN_REQUESTED')::int AS return_requested_count,
         COUNT(*) FILTER (WHERE created_at >= date_trunc('month', now()))::int AS orders_this_month,
         COALESCE(
           SUM(total_amount) FILTER (WHERE status != ALL($1) AND created_at >= date_trunc('month', now())),
           0
         ) AS revenue_this_month
       FROM orders`,
      [UNSPENT_STATUSES],
    ),
    query(
      `SELECT
         COUNT(*)::int AS total_products,
         COUNT(*) FILTER (WHERE status = 'ACTIVE')::int AS active_products
       FROM products`,
    ),
    query(`SELECT COUNT(*)::int AS total_customers FROM users`),
    // Last 14 days of revenue, one row per day (zero-filled) — powers the
    // dashboard's trend sparkline without the client doing date math.
    query(
      `SELECT day::date AS day, COALESCE(SUM(o.total_amount), 0) AS revenue
       FROM generate_series(CURRENT_DATE - INTERVAL '13 days', CURRENT_DATE, INTERVAL '1 day') AS day
       LEFT JOIN orders o
         ON o.created_at::date = day AND o.status != ALL($1)
       GROUP BY day
       ORDER BY day`,
      [UNSPENT_STATUSES],
    ),
  ]);

  return {
    ...orderStats.rows[0],
    ...productStats.rows[0],
    ...customerStats.rows[0],
    revenueTrend: revenueTrend.rows,
  };
}
