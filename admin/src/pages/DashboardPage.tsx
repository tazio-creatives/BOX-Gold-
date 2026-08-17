import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { fetchAdminProducts } from '../api/products';
import { fetchAdminOrders } from '../api/orders';
import { fetchAdminCustomers } from '../api/customers';
import { formatPrice } from '../utils/formatPrice';
import sharedStyles from '../styles/shared.module.css';
import styles from './DashboardPage.module.css';

export function DashboardPage() {
  const { data: products } = useQuery({
    queryKey: ['admin-products', 'count'],
    queryFn: () => fetchAdminProducts({ limit: 1 }),
  });
  const { data: pendingOrders } = useQuery({
    queryKey: ['admin-orders', 'pending-count'],
    queryFn: () => fetchAdminOrders('PENDING_PAYMENT', 1, 1),
  });
  const { data: recentOrders } = useQuery({
    queryKey: ['admin-orders', 'recent'],
    queryFn: () => fetchAdminOrders(undefined, 1, 5),
  });
  const { data: customers } = useQuery({
    queryKey: ['admin-customers', 'count'],
    queryFn: () => fetchAdminCustomers(undefined, 1, 1),
  });

  return (
    <div>
      <div className={sharedStyles.pageHeader}>
        <h1 className={sharedStyles.pageTitle}>Dashboard</h1>
      </div>

      <div className={styles.statsGrid}>
        <Link to="/products" className={`${sharedStyles.cardPadded} ${styles.statCard}`}>
          <p className={styles.statLabel}>Products</p>
          <p className={styles.statValue}>{products?.total ?? '—'}</p>
        </Link>
        <Link to="/orders?status=PENDING_PAYMENT" className={`${sharedStyles.cardPadded} ${styles.statCard}`}>
          <p className={styles.statLabel}>Pending Payment</p>
          <p className={styles.statValue}>{pendingOrders?.total ?? '—'}</p>
        </Link>
        <Link to="/customers" className={`${sharedStyles.cardPadded} ${styles.statCard}`}>
          <p className={styles.statLabel}>Customers</p>
          <p className={styles.statValue}>{customers?.total ?? '—'}</p>
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
                <th>Customer</th>
                <th>Status</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              {recentOrders.orders.map((order) => (
                <tr key={order.id}>
                  <td>
                    <Link to={`/orders/${order.id}`}>{order.orderNumber}</Link>
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
