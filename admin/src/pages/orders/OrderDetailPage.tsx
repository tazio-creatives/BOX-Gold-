import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { fetchAdminOrder, updateOrderStatus } from '../../api/orders';
import { shipOrder, cancelShipment, simulateTracking, addTrackingEvent } from '../../api/shipping';
import type { OrderStatus } from '../../api/types';
import { formatPrice } from '../../utils/formatPrice';
import { ApiError } from '../../api/client';
import { ORDER_STATUSES, ORDER_STATUS_BADGE_CLASS, formatOrderStatus } from '../../utils/orderStatus';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import sharedStyles from '../../styles/shared.module.css';
import styles from './OrderDetailPage.module.css';

const SHIPPABLE_STATUSES = new Set(['CONFIRMED', 'PROCESSING']);

export function OrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();

  const [statusDraft, setStatusDraft] = useState<OrderStatus | ''>('');
  const [statusNote, setStatusNote] = useState('');
  const [eventStatus, setEventStatus] = useState('');
  const [eventLocation, setEventLocation] = useState('');
  const [eventNote, setEventNote] = useState('');
  const [confirmingCancelShipment, setConfirmingCancelShipment] = useState(false);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['admin-order', id],
    queryFn: () => fetchAdminOrder(id as string),
    enabled: !!id,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['admin-order', id] });

  const statusMutation = useMutation({
    mutationFn: () => updateOrderStatus(id as string, statusDraft as OrderStatus, statusNote.trim() || undefined),
    onSuccess: () => {
      invalidate();
      setStatusDraft('');
      setStatusNote('');
    },
    onError: (err) => window.alert(err instanceof ApiError ? err.message : 'Could not update order status.'),
  });

  const shipMutation = useMutation({
    mutationFn: () => shipOrder(id as string),
    onSuccess: invalidate,
    onError: (err) => window.alert(err instanceof ApiError ? err.message : 'Could not ship order.'),
  });

  const cancelMutation = useMutation({
    mutationFn: () => cancelShipment(id as string),
    onSuccess: () => {
      invalidate();
      setConfirmingCancelShipment(false);
    },
    onError: (err) => {
      window.alert(err instanceof ApiError ? err.message : 'Could not cancel shipment.');
      setConfirmingCancelShipment(false);
    },
  });

  const trackingMutation = useMutation({
    mutationFn: (status: 'OUT_FOR_DELIVERY' | 'DELIVERED') => simulateTracking(id as string, status),
    onSuccess: invalidate,
    onError: (err) => window.alert(err instanceof ApiError ? err.message : 'Could not update tracking.'),
  });

  const eventMutation = useMutation({
    mutationFn: () =>
      addTrackingEvent(id as string, {
        status: eventStatus.trim(),
        location: eventLocation.trim() || undefined,
        note: eventNote.trim() || undefined,
      }),
    onSuccess: () => {
      invalidate();
      setEventStatus('');
      setEventLocation('');
      setEventNote('');
    },
    onError: (err) => window.alert(err instanceof ApiError ? err.message : 'Could not add tracking event.'),
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
  const badgeClass = ORDER_STATUS_BADGE_CLASS[order.status] ?? 'badgeNeutral';

  return (
    <div>
      <Link to="/orders" className={styles.back}>
        ← Back to orders
      </Link>

      <div className={styles.headerCard}>
        <div>
          <p className={styles.orderNumber}>{order.orderNumber}</p>
          <p className={styles.subtext}>
            {order.contactName} · {order.contactMobile} · {order.contactEmail}
          </p>
          <p className={styles.subtext}>
            Placed {new Date(order.createdAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
          </p>
        </div>
        <div className={styles.headerRight}>
          <span className={`${sharedStyles[badgeClass]} ${styles.currentStatusBadge}`}>
            {formatOrderStatus(order.status)}
          </span>
          <p className={styles.totalPreview}>{formatPrice(order.totalAmount)}</p>
        </div>
      </div>

      <section className={`${sharedStyles.cardPadded} ${styles.statusChangeCard}`}>
        <h2 className={styles.sectionHeading}>Change Order Status</h2>
        <form
          className={styles.statusForm}
          onSubmit={(e) => {
            e.preventDefault();
            if (statusDraft) statusMutation.mutate();
          }}
        >
          <select
            className={styles.statusSelect}
            value={statusDraft}
            onChange={(e) => setStatusDraft(e.target.value as OrderStatus)}
          >
            <option value="">Select new status…</option>
            {ORDER_STATUSES.map((s) => (
              <option key={s} value={s} disabled={s === order.status}>
                {formatOrderStatus(s)}
                {s === order.status ? ' (current)' : ''}
              </option>
            ))}
          </select>
          <input
            type="text"
            className={styles.statusNoteInput}
            placeholder="Note (optional)"
            value={statusNote}
            onChange={(e) => setStatusNote(e.target.value)}
          />
          <button
            type="submit"
            className={sharedStyles.buttonPrimary}
            disabled={!statusDraft || statusMutation.isPending}
          >
            {statusMutation.isPending ? 'Updating…' : 'Update Status'}
          </button>
        </form>
      </section>

      <div className={styles.layout}>
        <div className={styles.main}>
          <section className={sharedStyles.cardPadded}>
            <h2 className={styles.sectionHeading}>Items</h2>
            {order.items.map((item) => (
              <div key={item.id} className={styles.itemRow}>
                <div>
                  <p className={styles.itemName}>
                    {item.productName}
                    {item.isBackordered && (
                      <>
                        {' '}
                        <span className={sharedStyles.badgeWarning}>Make to Order</span>
                      </>
                    )}
                  </p>
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
            {order.deliveryNote && (
              <>
                <h2 className={`${styles.sectionHeading} ${styles.sectionHeadingSpaced}`}>Delivery Note</h2>
                <p className={styles.address}>{order.deliveryNote}</p>
              </>
            )}
          </section>

          <section className={sharedStyles.cardPadded}>
            <h2 className={styles.sectionHeading}>Order Timeline</h2>
            <ol className={styles.timeline}>
              {order.statusHistory.map((h, i) => (
                <li key={i} className={styles.timelineItem}>
                  <span className={styles.timelineDot} />
                  <div className={styles.timelineBody}>
                    <div className={styles.timelineTop}>
                      <span className={styles.timelineStatus}>{formatOrderStatus(h.status)}</span>
                      <span className={styles.timelineDate}>
                        {new Date(h.createdAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
                      </span>
                    </div>
                    {h.note && <p className={styles.timelineNote}>{h.note}</p>}
                  </div>
                </li>
              ))}
            </ol>
          </section>

          {order.shipment && (
            <section className={sharedStyles.cardPadded}>
              <h2 className={styles.sectionHeading}>Shipment History</h2>
              <p className={styles.hint}>
                Logged manually for now — once a courier partner is integrated, real tracking updates will appear
                here automatically alongside these entries.
              </p>

              <form
                className={styles.eventForm}
                onSubmit={(e) => {
                  e.preventDefault();
                  if (eventStatus.trim()) eventMutation.mutate();
                }}
              >
                <input
                  type="text"
                  className={styles.eventInput}
                  placeholder="Status (e.g. In Transit, Reached Hub)"
                  value={eventStatus}
                  onChange={(e) => setEventStatus(e.target.value)}
                />
                <input
                  type="text"
                  className={styles.eventInput}
                  placeholder="Location (optional)"
                  value={eventLocation}
                  onChange={(e) => setEventLocation(e.target.value)}
                />
                <input
                  type="text"
                  className={styles.eventInputWide}
                  placeholder="Note (optional)"
                  value={eventNote}
                  onChange={(e) => setEventNote(e.target.value)}
                />
                <button
                  type="submit"
                  className={sharedStyles.buttonPrimary}
                  disabled={!eventStatus.trim() || eventMutation.isPending}
                >
                  {eventMutation.isPending ? 'Adding…' : 'Add Update'}
                </button>
              </form>

              {order.shipment.trackingEvents.length === 0 && (
                <p className={sharedStyles.empty}>No tracking updates logged yet.</p>
              )}
              {order.shipment.trackingEvents.length > 0 && (
                <ol className={styles.timeline}>
                  {order.shipment.trackingEvents.map((event) => (
                    <li key={event.id} className={styles.timelineItem}>
                      <span className={styles.timelineDot} />
                      <div className={styles.timelineBody}>
                        <div className={styles.timelineTop}>
                          <span className={styles.timelineStatus}>{event.status}</span>
                          <span className={styles.timelineDate}>
                            {new Date(event.createdAt).toLocaleString('en-IN', {
                              dateStyle: 'medium',
                              timeStyle: 'short',
                            })}
                          </span>
                        </div>
                        <p className={styles.timelineNote}>
                          {event.location && <span>{event.location}</span>}
                          {event.location && event.note && ' · '}
                          {event.note && <span>{event.note}</span>}
                          {(event.location || event.note) && ' · '}
                          <span className={styles.eventSource}>{event.source.toLowerCase()}</span>
                        </p>
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </section>
          )}
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
                  <strong>{formatOrderStatus(order.shipment.status)}</strong>
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
                      onClick={() => setConfirmingCancelShipment(true)}
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

      {confirmingCancelShipment && (
        <ConfirmDialog
          title="Cancel shipment"
          message="Cancel this shipment? This cannot be undone."
          confirmLabel="Cancel Shipment"
          cancelLabel="Keep Shipment"
          isPending={cancelMutation.isPending}
          onConfirm={() => cancelMutation.mutate()}
          onCancel={() => setConfirmingCancelShipment(false)}
        />
      )}
    </div>
  );
}
