import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { fetchAdminOrders } from '../../api/orders';
import type { OrderStatus } from '../../api/types';
import { formatPrice } from '../../utils/formatPrice';
import sharedStyles from '../../styles/shared.module.css';
import styles from './OrdersListPage.module.css';

const STATUSES: OrderStatus[] = [
  'PENDING_PAYMENT',
  'CONFIRMED',
  'PROCESSING',
  'SHIPPED',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
  'PAYMENT_FAILED',
  'EXPIRED',
  'CANCELLED',
  'RETURN_REQUESTED',
  'REFUNDED',
];

const STATUS_CLASS: Record<string, string> = {
  DELIVERED: 'badgeSuccess',
  CONFIRMED: 'badgeSuccess',
  PROCESSING: 'badgeSuccess',
  SHIPPED: 'badgeSuccess',
  OUT_FOR_DELIVERY: 'badgeSuccess',
  PENDING_PAYMENT: 'badgeWarning',
  PAYMENT_FAILED: 'badgeDanger',
  EXPIRED: 'badgeDanger',
  CANCELLED: 'badgeDanger',
};

export function OrdersListPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const status = (searchParams.get('status') as OrderStatus | null) ?? undefined;
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ['admin-orders', { status, page }],
    queryFn: () => fetchAdminOrders(status, page, 20),
  });

  return (
    <div>
      <div className={sharedStyles.pageHeader}>
        <h1 className={sharedStyles.pageTitle}>Orders</h1>
      </div>

      <div className={styles.filters}>
        <select
          value={status ?? ''}
          onChange={(e) => {
            const next = new URLSearchParams(searchParams);
            if (e.target.value) next.set('status', e.target.value);
            else next.delete('status');
            setSearchParams(next);
            setPage(1);
          }}
        >
          <option value="">All statuses</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s.replace(/_/g, ' ')}
            </option>
          ))}
        </select>
      </div>

      <div className={sharedStyles.card}>
        {isLoading && <p className={sharedStyles.empty}>Loading…</p>}
        {!isLoading && data && data.orders.length === 0 && (
          <p className={sharedStyles.empty}>No orders match this filter.</p>
        )}
        {!isLoading && data && data.orders.length > 0 && (
          <table className={sharedStyles.table}>
            <thead>
              <tr>
                <th>Order</th>
                <th>Customer</th>
                <th>Status</th>
                <th>Total</th>
                <th>Placed</th>
              </tr>
            </thead>
            <tbody>
              {data.orders.map((order) => (
                <tr key={order.id}>
                  <td>
                    <Link to={`/orders/${order.id}`}>{order.orderNumber}</Link>
                  </td>
                  <td>
                    {order.contactName}
                    <div className={styles.mobile}>{order.contactMobile}</div>
                  </td>
                  <td>
                    <span className={sharedStyles[STATUS_CLASS[order.status] ?? 'badgeNeutral']}>
                      {order.status.replace(/_/g, ' ')}
                    </span>
                  </td>
                  <td>{formatPrice(order.totalAmount)}</td>
                  <td>{new Date(order.createdAt).toLocaleDateString('en-IN')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {data && data.totalPages > 1 && (
        <div className={sharedStyles.pagination}>
          <button type="button" className={sharedStyles.button} disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            Previous
          </button>
          <span>
            Page {data.page} of {data.totalPages}
          </span>
          <button
            type="button"
            className={sharedStyles.button}
            disabled={page >= data.totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
