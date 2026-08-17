import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { fetchOrders } from '../../api/orders';
import { formatPrice } from '../../utils/formatPrice';
import { useDocumentTitle } from '../../utils/useDocumentTitle';
import styles from './MyOrdersPage.module.css';

function formatStatus(status: string) {
  return status
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

const STATUS_CLASS: Record<string, string> = {
  DELIVERED: 'statusGood',
  CONFIRMED: 'statusGood',
  PROCESSING: 'statusGood',
  SHIPPED: 'statusGood',
  OUT_FOR_DELIVERY: 'statusGood',
  PENDING_PAYMENT: 'statusPending',
  PAYMENT_FAILED: 'statusBad',
  EXPIRED: 'statusBad',
  CANCELLED: 'statusBad',
};

function BagIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M6 8h12l-1 12H7L6 8z" />
      <path d="M9 8V6a3 3 0 0 1 6 0v2" />
    </svg>
  );
}

function ChevronIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function MyOrdersPage() {
  useDocumentTitle('My Orders');
  const { data, isLoading } = useQuery({ queryKey: ['orders'], queryFn: () => fetchOrders() });

  if (isLoading) {
    return (
      <div aria-busy="true">
        <h2 className={styles.subheading}>Orders</h2>
        <div className={styles.list}>
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className={styles.skeletonRow} />
          ))}
        </div>
      </div>
    );
  }

  const orders = data?.orders ?? [];

  if (orders.length === 0) {
    return (
      <div>
        <h2 className={styles.subheading}>Orders</h2>
        <div className={styles.empty}>
          <span className={styles.emptyIcon}>
            <BagIcon />
          </span>
          <p className={styles.emptyText}>You haven't placed any orders yet.</p>
          <Link to="/" className={styles.link}>
            Start Shopping
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div>
      <h2 className={styles.subheading}>Orders</h2>
      <div className={styles.list}>
        {orders.map((order) => (
          <Link key={order.id} to={`/account/orders/${order.id}`} className={styles.row}>
            <span className={styles.rowIcon}>
              <BagIcon />
            </span>
            <div className={styles.rowInfo}>
              <p className={styles.orderNumber}>{order.orderNumber}</p>
              <p className={styles.date}>
                {new Date(order.createdAt).toLocaleDateString('en-IN', { dateStyle: 'medium' })}
              </p>
            </div>
            <span className={`${styles.status} ${styles[STATUS_CLASS[order.status] ?? 'statusPending']}`}>
              {formatStatus(order.status)}
            </span>
            <p className={styles.total}>{formatPrice(order.totalAmount)}</p>
            <span className={styles.rowChevron}>
              <ChevronIcon />
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
