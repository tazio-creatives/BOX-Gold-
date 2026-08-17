import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { fetchOrderById } from '../../api/orders';
import { OrderDetails } from '../../features/orders/OrderDetails';
import { useDocumentTitle } from '../../utils/useDocumentTitle';
import styles from './OrderDetailPage.module.css';

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
      </div>
      <OrderDetails order={order} />
    </div>
  );
}
