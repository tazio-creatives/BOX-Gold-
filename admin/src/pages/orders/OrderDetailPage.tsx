import { Link, useParams } from 'react-router-dom';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { fetchAdminOrder } from '../../api/orders';
import { shipOrder, cancelShipment, simulateTracking } from '../../api/shipping';
import { formatPrice } from '../../utils/formatPrice';
import { ApiError } from '../../api/client';
import sharedStyles from '../../styles/shared.module.css';
import styles from './OrderDetailPage.module.css';

function formatStatus(status: string) {
  return status
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

const SHIPPABLE_STATUSES = new Set(['CONFIRMED', 'PROCESSING']);

export function OrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();

  const { data, isLoading, isError } = useQuery({
    queryKey: ['admin-order', id],
    queryFn: () => fetchAdminOrder(id as string),
    enabled: !!id,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['admin-order', id] });

  const shipMutation = useMutation({
    mutationFn: () => shipOrder(id as string),
    onSuccess: invalidate,
    onError: (err) => window.alert(err instanceof ApiError ? err.message : 'Could not ship order.'),
  });

  const cancelMutation = useMutation({
    mutationFn: () => cancelShipment(id as string),
    onSuccess: invalidate,
    onError: (err) => window.alert(err instanceof ApiError ? err.message : 'Could not cancel shipment.'),
  });

  const trackingMutation = useMutation({
    mutationFn: (status: 'OUT_FOR_DELIVERY' | 'DELIVERED') => simulateTracking(id as string, status),
    onSuccess: invalidate,
    onError: (err) => window.alert(err instanceof ApiError ? err.message : 'Could not update tracking.'),
  });

  if (isLoading) return <p>Loading…</p>;
  if (isError || !data) {
    return (
      <div>
        <Link to="/orders" className={styles.back}>
          ← Back to orders
        </Link>
        <p className={sharedStyles.empty}>Order not found.</p>
      </div>
    );
  }

  const { order } = data;

  return (
    <div>
      <Link to="/orders" className={styles.back}>
        ← Back to orders
      </Link>

      <div className={sharedStyles.pageHeader}>
        <div>
          <h1 className={sharedStyles.pageTitle}>{order.orderNumber}</h1>
          <p className={styles.subtext}>
            {order.contactName} · {order.contactMobile} · {order.contactEmail}
          </p>
        </div>
        <span className={sharedStyles.badgeNeutral}>{formatStatus(order.status)}</span>
      </div>

      <div className={styles.layout}>
        <div className={styles.main}>
          <section className={sharedStyles.cardPadded}>
            <h2 className={styles.sectionHeading}>Items</h2>
            {order.items.map((item) => (
              <div key={item.id} className={styles.itemRow}>
                <div>
                  <p className={styles.itemName}>{item.productName}</p>
                  <p className={styles.itemMeta}>
                    SKU {item.productSku} · Qty {item.quantity}
                  </p>
                </div>
                <p className={styles.itemPrice}>{formatPrice(item.lineTotal)}</p>
              </div>
            ))}
            <div className={styles.totalsBlock}>
              <div className={styles.totalRow}>
                <span>Subtotal</span>
                <span>{formatPrice(order.subtotal)}</span>
              </div>
              {order.discountAmount > 0 && (
                <div className={styles.totalRow}>
                  <span>Discount{order.couponCode ? ` (${order.couponCode})` : ''}</span>
                  <span>-{formatPrice(order.discountAmount)}</span>
                </div>
              )}
              <div className={styles.totalRow}>
                <span>GST</span>
                <span>{formatPrice(order.gstAmount)}</span>
              </div>
              <div className={styles.totalRow}>
                <span>Shipping</span>
                <span>{order.shippingAmount > 0 ? formatPrice(order.shippingAmount) : 'Free'}</span>
              </div>
              <div className={`${styles.totalRow} ${styles.grandTotal}`}>
                <span>Total</span>
                <span>{formatPrice(order.totalAmount)}</span>
              </div>
            </div>
          </section>

          <section className={sharedStyles.cardPadded}>
            <h2 className={styles.sectionHeading}>Delivery Address</h2>
            <p className={styles.address}>
              {order.shippingAddress.name}
              <br />
              {order.shippingAddress.addressLine}
              {order.shippingAddress.building ? `, ${order.shippingAddress.building}` : ''}
              <br />
              {order.shippingAddress.city}, {order.shippingAddress.state} {order.shippingAddress.pincode}
              <br />
              {order.shippingAddress.mobileNumber}
            </p>
          </section>

          <section className={sharedStyles.cardPadded}>
            <h2 className={styles.sectionHeading}>Order Timeline</h2>
            {order.statusHistory.map((h, i) => (
              <div key={i} className={styles.timelineRow}>
                <span className={styles.timelineStatus}>{formatStatus(h.status)}</span>
                <span className={styles.timelineDate}>
                  {new Date(h.createdAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
                </span>
                {h.note && <span className={styles.timelineNote}>{h.note}</span>}
              </div>
            ))}
          </section>
        </div>

        <aside className={styles.side}>
          <section className={sharedStyles.cardPadded}>
            <h2 className={styles.sectionHeading}>Shipping</h2>

            {!order.shipment && (
              <>
                <p className={styles.subtext}>No shipment created yet.</p>
                <button
                  type="button"
                  className={sharedStyles.buttonPrimary}
                  disabled={!SHIPPABLE_STATUSES.has(order.status) || shipMutation.isPending}
                  onClick={() => shipMutation.mutate()}
                >
                  {shipMutation.isPending ? 'Shipping…' : 'Ship Order'}
                </button>
                {!SHIPPABLE_STATUSES.has(order.status) && (
                  <p className={styles.hint}>Order must be Confirmed or Processing to ship.</p>
                )}
              </>
            )}

            {order.shipment && (
              <>
                <p className={styles.shipmentLine}>
                  {order.shipment.courierName ?? order.shipment.provider} —{' '}
                  <strong>{formatStatus(order.shipment.status)}</strong>
                </p>
                {order.shipment.trackingNumber && (
                  <p className={styles.shipmentLine}>Tracking: {order.shipment.trackingNumber}</p>
                )}

                {order.shipment.status !== 'CANCELLED' && order.shipment.status !== 'DELIVERED' && (
                  <div className={styles.shipmentActions}>
                    <button
                      type="button"
                      className={sharedStyles.button}
                      disabled={trackingMutation.isPending || order.shipment.status === 'OUT_FOR_DELIVERY'}
                      onClick={() => trackingMutation.mutate('OUT_FOR_DELIVERY')}
                    >
                      Mark Out for Delivery
                    </button>
                    <button
                      type="button"
                      className={sharedStyles.button}
                      disabled={trackingMutation.isPending}
                      onClick={() => trackingMutation.mutate('DELIVERED')}
                    >
                      Mark Delivered
                    </button>
                    <button
                      type="button"
                      className={sharedStyles.buttonDanger}
                      disabled={cancelMutation.isPending}
                      onClick={() => {
                        if (window.confirm('Cancel this shipment?')) cancelMutation.mutate();
                      }}
                    >
                      Cancel Shipment
                    </button>
                  </div>
                )}
                <p className={styles.hint}>
                  Stub courier provider — tracking buttons simulate what a real courier's webhook would send.
                </p>
              </>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}
