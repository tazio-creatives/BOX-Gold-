import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { fetchOrders, fetchOrderStats, type OrderSummary } from '../../api/orders';
import type { StatusFilterValue } from '../../api/types';
import { OrderProgressStepper } from '../../features/account/OrderProgressStepper';
import { formatPrice } from '../../utils/formatPrice';
import { placeholderGradient } from '../../utils/placeholderGradient';
import { useDocumentTitle } from '../../utils/useDocumentTitle';
import { DeliveryEstimateCompact } from '../../components/DeliveryEstimate';
import styles from './MyOrdersPage.module.css';

// The happy-path stepper only makes sense while the order is actually
// progressing toward delivery — exception states (and no order_status yet,
// i.e. still awaiting payment) misrepresent what happened if shown as a
// stepper position, so the status badge alone covers those instead.
const STEPPER_STATUSES = new Set([
  'CONFIRMED',
  'PROCESSING',
  'READY_TO_SHIP',
  'SHIPPED',
  'IN_TRANSIT',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
]);

const STATUS_FILTERS: { value: StatusFilterValue | ''; label: string }[] = [
  { value: '', label: 'All orders' },
  { value: 'CONFIRMED', label: 'Confirmed' },
  { value: 'PROCESSING', label: 'Processing' },
  { value: 'READY_TO_SHIP', label: 'Ready to Ship' },
  { value: 'SHIPPED', label: 'Shipped' },
  { value: 'IN_TRANSIT', label: 'In Transit' },
  { value: 'OUT_FOR_DELIVERY', label: 'Out for Delivery' },
  { value: 'DELIVERED', label: 'Delivered' },
  { value: 'CANCELLED', label: 'Cancelled' },
];

function formatStatus(status: string) {
  return status
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// order_status is null until payment succeeds — falls back to a
// payment-driven pseudo-status so the badge always has something to show.
function displayStatus(order: OrderSummary): string {
  return order.orderStatus ?? (order.paymentStatus === 'FAILED' ? 'PAYMENT_FAILED' : 'PENDING_PAYMENT');
}

const STATUS_CLASS: Record<string, string> = {
  DELIVERED: 'statusGood',
  CONFIRMED: 'statusGood',
  PROCESSING: 'statusGood',
  READY_TO_SHIP: 'statusGood',
  SHIPPED: 'statusGood',
  IN_TRANSIT: 'statusGood',
  OUT_FOR_DELIVERY: 'statusGood',
  DELAYED: 'statusPending',
  DELIVERY_FAILED: 'statusBad',
  RETURN_INITIATED: 'statusPending',
  RETURNED: 'statusBad',
  PENDING_PAYMENT: 'statusPending',
  PAYMENT_FAILED: 'statusBad',
  CANCELLED: 'statusBad',
};

function BagIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M6 8h12l-1 12H7L6 8z" />
      <path d="M9 8V6a3 3 0 0 1 6 0v2" />
    </svg>
  );
}

function PackageIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3z" strokeLinejoin="round" />
      <path d="M4 7.5L12 12l8-4.5M12 12v9" strokeLinejoin="round" />
    </svg>
  );
}

function RupeeIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M6 4h11M6 9h11M6 4c4 0 6 1.5 6 4s-2 4-6 4h-1l7 7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function HeadsetIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M4 13v-1a8 8 0 0 1 16 0v1" strokeLinecap="round" />
      <rect x="3" y="13" width="4" height="6" rx="1.5" />
      <rect x="17" y="13" width="4" height="6" rx="1.5" />
      <path d="M20 19v1a3 3 0 0 1-3 3h-3" strokeLinecap="round" />
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
  const [statusFilter, setStatusFilter] = useState<StatusFilterValue | ''>('');

  const { data, isLoading } = useQuery({
    queryKey: ['orders', statusFilter],
    queryFn: () => fetchOrders(1, 10, statusFilter || undefined),
  });
  const { data: statsData } = useQuery({ queryKey: ['order-stats'], queryFn: fetchOrderStats });

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

  return (
    <div>
      <div className={styles.header}>
        <h2 className={styles.subheading}>My Orders</h2>
        <select
          className={styles.filterSelect}
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as StatusFilterValue | '')}
          aria-label="Filter orders by status"
        >
          {STATUS_FILTERS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {statsData && (
        <div className={styles.statsRow}>
          <div className={styles.statCard}>
            <span className={styles.statIcon}>
              <BagIcon />
            </span>
            <div>
              <p className={styles.statLabel}>Total Orders</p>
              <p className={styles.statValue}>{statsData.totalOrders}</p>
            </div>
          </div>
          <div className={styles.statCard}>
            <span className={styles.statIcon}>
              <PackageIcon />
            </span>
            <div>
              <p className={styles.statLabel}>Active Orders</p>
              <p className={styles.statValue}>{statsData.activeOrders}</p>
            </div>
          </div>
          <div className={styles.statCard}>
            <span className={styles.statIcon}>
              <RupeeIcon />
            </span>
            <div>
              <p className={styles.statLabel}>Total Spent</p>
              <p className={styles.statValue}>{formatPrice(statsData.totalSpent)}</p>
            </div>
          </div>
        </div>
      )}

      {orders.length === 0 ? (
        <div className={styles.empty}>
          <span className={styles.emptyIcon}>
            <BagIcon />
          </span>
          <p className={styles.emptyText}>
            {statusFilter ? 'No orders match this filter.' : "You haven't placed any orders yet."}
          </p>
          <Link to="/" className={styles.link}>
            Start Shopping
          </Link>
        </div>
      ) : (
        <div className={styles.list}>
          {orders.map((order, i) => (
            <div key={order.id} className={styles.card}>
              <div
                className={styles.thumb}
                style={order.previewImageUrl ? undefined : { background: placeholderGradient(i) }}
              >
                {order.previewImageUrl && <img src={order.previewImageUrl} alt="" className={styles.thumbImg} />}
              </div>

              <div className={styles.cardBody}>
                <div className={styles.cardTop}>
                  <div>
                    <p className={styles.orderNumber}>{order.orderNumber}</p>
                    <p className={styles.meta}>
                      {new Date(order.createdAt).toLocaleDateString('en-IN', { dateStyle: 'medium' })} ·{' '}
                      {order.itemCount} {order.itemCount === 1 ? 'item' : 'items'}
                    </p>
                    <DeliveryEstimateCompact estimate={order.deliveryEstimate} />
                  </div>
                  <span className={`${styles.status} ${styles[STATUS_CLASS[displayStatus(order)] ?? 'statusPending']}`}>
                    {formatStatus(displayStatus(order))}
                  </span>
                </div>

                {order.orderStatus !== null && STEPPER_STATUSES.has(order.orderStatus) && (
                  <div className={styles.stepperWrap}>
                    <OrderProgressStepper
                      createdAt={order.createdAt}
                      confirmedAt={order.confirmedAt}
                      processingAt={order.processingAt}
                      readyToShipAt={order.readyToShipAt}
                      shippedAt={order.shippedAt}
                      inTransitAt={order.inTransitAt}
                      outForDeliveryAt={order.outForDeliveryAt}
                      deliveredAt={order.deliveredAt}
                    />
                  </div>
                )}
              </div>

              <div className={styles.cardEnd}>
                <p className={styles.total}>{formatPrice(order.totalAmount)}</p>
                <Link to={`/account/orders/${order.id}`} className={styles.viewDetails}>
                  View details
                </Link>
              </div>

              <Link to={`/account/orders/${order.id}`} className={styles.cardChevron} aria-label="View order details">
                <ChevronIcon />
              </Link>
            </div>
          ))}
        </div>
      )}

      <div className={styles.supportCard}>
        <span className={styles.supportIcon}>
          <HeadsetIcon />
        </span>
        <div className={styles.supportText}>
          <p className={styles.supportTitle}>Need help with an order?</p>
          <p className={styles.supportBody}>Our support team is here to help you with any questions or concerns.</p>
        </div>
        <Link to="/contact" className={styles.supportButton}>
          Contact Support
        </Link>
      </div>
    </div>
  );
}
