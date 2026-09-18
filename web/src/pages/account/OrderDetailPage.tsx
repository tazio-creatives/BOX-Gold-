import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { fetchOrderById } from '../../api/orders';
import { OrderDetails } from '../../features/orders/OrderDetails';
import { useDocumentTitle } from '../../utils/useDocumentTitle';
import styles from './OrderDetailPage.module.css';

function formatStatus(status: string) {
  return status
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

const PAYMENT_STATUS_CLASS: Record<string, string> = {
  PENDING: 'statusPending',
  PAID: 'statusGood',
  FAILED: 'statusBad',
  REFUNDED: 'statusPending',
};

const ORDER_STATUS_CLASS: Record<string, string> = {
  CONFIRMED: 'statusGood',
  PROCESSING: 'statusGood',
  READY_TO_SHIP: 'statusGood',
  SHIPPED: 'statusGood',
  IN_TRANSIT: 'statusGood',
  OUT_FOR_DELIVERY: 'statusGood',
  DELIVERED: 'statusGood',
  DELAYED: 'statusPending',
  DELIVERY_FAILED: 'statusBad',
  RETURN_INITIATED: 'statusPending',
  RETURNED: 'statusBad',
  CANCELLED: 'statusBad',
};

export function OrderDetailPage() {
  const { orderId } = useParams<{ orderId: string }>();
  const { data, isLoading, isError } = useQuery({
    queryKey: ['order', orderId],
    queryFn: () => fetchOrderById(orderId as string),
    enabled: !!orderId,
  });

  useDocumentTitle(data ? `Order ${data.order.orderNumber}` : 'Order');

  if (isLoading) {
    return (
      <div aria-busy="true">
        <div className={styles.header}>
          <div className={styles.skeletonLine} style={{ width: 160, height: 22, marginBottom: 8 }} />
          <div className={styles.skeletonLine} style={{ width: 220 }} />
        </div>
        <div className={styles.skeletonContent} />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div>
        <h2 className={styles.subheading}>Order not found</h2>
        <Link to="/account/orders" className={styles.back}>
          ← Back to orders
        </Link>
      </div>
    );
  }

  const { order } = data;

  return (
    <div>
      <Link to="/account/orders" className={styles.back}>
        ← Back to orders
      </Link>
      <div className={styles.header}>
        <h2 className={styles.subheading}>{order.orderNumber}</h2>
        <p className={styles.date}>
          Placed {new Date(order.createdAt).toLocaleDateString('en-IN', { dateStyle: 'long' })}
        </p>
        <div className={styles.statusRow}>
          <span className={`${styles.status} ${styles[PAYMENT_STATUS_CLASS[order.paymentStatus] ?? 'statusPending']}`}>
            Payment: {formatStatus(order.paymentStatus)}
          </span>
          <span
            className={`${styles.status} ${
              styles[order.orderStatus ? ORDER_STATUS_CLASS[order.orderStatus] ?? 'statusPending' : 'statusPending']
            }`}
          >
            {formatStatus(order.orderStatus ?? 'Awaiting Payment')}
          </span>
        </div>
      </div>
      <OrderDetails order={order} />
    </div>
  );
}
