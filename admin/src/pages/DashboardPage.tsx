import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { fetchDashboardStats } from '../api/dashboard';
import { fetchAdminOrders } from '../api/orders';
import { RevenueTrendChart } from '../features/dashboard/RevenueTrendChart';
import { formatPrice } from '../utils/formatPrice';
import { shortOrderNumber } from '../utils/orderNumber';
import {
  OrdersStatIcon,
  ClockStatIcon,
  TruckStatIcon,
  ReturnStatIcon,
  ProductsStatIcon,
  CustomersStatIcon,
} from './DashboardIcons';
import sharedStyles from '../styles/shared.module.css';
import styles from './DashboardPage.module.css';

export function DashboardPage() {
  const { data: stats } = useQuery({
    queryKey: ['admin-dashboard-stats'],
    queryFn: fetchDashboardStats,
  });
  const { data: recentOrders } = useQuery({
    queryKey: ['admin-orders', 'recent'],
    queryFn: () => fetchAdminOrders(undefined, 1, 5),
  });

  return (
    <div>
      <div className={sharedStyles.pageHeader}>
        <div>
          <h1 className={sharedStyles.pageTitle}>Dashboard</h1>
          <p className={styles.subtitle}>Overview of your store's performance</p>
        </div>
      </div>

      <div className={styles.heroGrid}>
        <div className={styles.heroCard}>
          <p className={styles.heroLabel}>Total Revenue</p>
          <p className={styles.heroValue}>{stats ? formatPrice(stats.totalRevenue) : '—'}</p>
          <p className={styles.heroFoot}>
            <span className={styles.heroFootValue}>{stats ? formatPrice(stats.revenueThisMonth) : '—'}</span>
            this month · from {stats?.ordersThisMonth ?? '—'} orders
          </p>
        </div>
        <div className={styles.trendCard}>
          <p className={styles.trendHeading}>Revenue — last 14 days</p>
          <div className={styles.trendChart}>
            {stats && <RevenueTrendChart data={stats.revenueTrend} />}
          </div>
        </div>
      </div>

      <div className={styles.statsGrid}>
        <Link to="/orders" className={styles.statCard}>
          <span className={styles.statIcon}>
            <OrdersStatIcon />
          </span>
          <div>
            <p className={styles.statLabel}>Total Orders</p>
            <p className={styles.statValue}>{stats?.totalOrders ?? '—'}</p>
          </div>
        </Link>
        <Link to="/orders?status=PENDING_PAYMENT" className={styles.statCard}>
          <span className={`${styles.statIcon} ${styles.statIconWarning}`}>
            <ClockStatIcon />
          </span>
          <div>
            <p className={styles.statLabel}>Pending Payment</p>
            <p className={styles.statValue}>{stats?.pendingPaymentCount ?? '—'}</p>
          </div>
        </Link>
        <Link to="/orders?status=PROCESSING" className={styles.statCard}>
          <span className={styles.statIcon}>
            <TruckStatIcon />
          </span>
          <div>
            <p className={styles.statLabel}>To Fulfill</p>
            <p className={styles.statValue}>{stats?.toFulfillCount ?? '—'}</p>
          </div>
        </Link>
        <Link to="/orders?status=RETURN_REQUESTED" className={styles.statCard}>
          <span className={`${styles.statIcon} ${styles.statIconDanger}`}>
            <ReturnStatIcon />
          </span>
          <div>
            <p className={styles.statLabel}>Return Requests</p>
            <p className={styles.statValue}>{stats?.returnRequestedCount ?? '—'}</p>
          </div>
        </Link>
        <Link to="/products" className={styles.statCard}>
          <span className={styles.statIcon}>
            <ProductsStatIcon />
          </span>
          <div>
            <p className={styles.statLabel}>Products</p>
            <p className={styles.statValue}>{stats?.totalProducts ?? '—'}</p>
            <p className={styles.statSub}>{stats?.activeProducts ?? '—'} active</p>
          </div>
        </Link>
        <Link to="/customers" className={styles.statCard}>
          <span className={styles.statIcon}>
            <CustomersStatIcon />
          </span>
          <div>
            <p className={styles.statLabel}>Customers</p>
            <p className={styles.statValue}>{stats?.totalCustomers ?? '—'}</p>
          </div>
        </Link>
      </div>

      <div className={sharedStyles.cardPadded}>
        <h2 className={styles.sectionHeading}>Recent Orders</h2>
        {recentOrders && recentOrders.orders.length === 0 && (
          <p className={sharedStyles.empty}>No orders yet.</p>
        )}
        {recentOrders && recentOrders.orders.length > 0 && (
          <table className={sharedStyles.table}>
            <thead>
              <tr>
                <th>Order</th>
                <th>Product</th>
                <th>Customer</th>
                <th>Status</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              {recentOrders.orders.map((order) => (
                <tr key={order.id}>
                  <td>
                    <Link to={`/orders/${order.id}`} title={order.orderNumber}>
                      {shortOrderNumber(order.orderNumber)}
                    </Link>
                  </td>
                  <td>
                    {order.productName ?? '—'}
                    {order.itemCount > 1 ? ` +${order.itemCount - 1} more` : ''}
                  </td>
                  <td>{order.contactName}</td>
                  <td>{order.status.replace(/_/g, ' ')}</td>
                  <td>{formatPrice(order.totalAmount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
