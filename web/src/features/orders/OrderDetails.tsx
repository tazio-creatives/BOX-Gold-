import type { Order } from '../../api/types';
import { formatPrice } from '../../utils/formatPrice';
import { WriteReviewButton } from './WriteReviewButton';
import styles from './OrderDetails.module.css';

function formatStatus(status: string) {
  return status
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function OrderDetails({ order }: { order: Order }) {
  return (
    <div className={styles.wrap}>
      <section className={styles.section}>
        <h2 className={styles.sectionHeading}>Items</h2>
        <ul className={styles.itemList}>
          {order.items.map((item) => (
            <li key={item.id} className={styles.item}>
              <div>
                <p className={styles.itemName}>{item.productName}</p>
                <p className={styles.itemMeta}>
                  SKU {item.productSku} · Qty {item.quantity}
                </p>
              </div>
              <div className={styles.itemTrailing}>
                <p className={styles.itemPrice}>{formatPrice(item.lineTotal)}</p>
                <WriteReviewButton
                  productId={item.productId}
                  orderItemId={item.id}
                  orderId={order.id}
                  canReview={item.canReview}
                />
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionHeading}>Price Details</h2>
        <div className={styles.priceRow}>
          <span>Subtotal</span>
          <span>{formatPrice(order.subtotal)}</span>
        </div>
        {order.discountAmount > 0 && (
          <div className={styles.priceRow}>
            <span>Discount{order.couponCode ? ` (${order.couponCode})` : ''}</span>
            <span>-{formatPrice(order.discountAmount)}</span>
          </div>
        )}
        <div className={styles.priceRow}>
          <span>GST</span>
          <span>{formatPrice(order.gstAmount)}</span>
        </div>
        <div className={styles.priceRow}>
          <span>Shipping</span>
          <span>{order.shippingAmount > 0 ? formatPrice(order.shippingAmount) : 'Free'}</span>
        </div>
        <div className={styles.totalRow}>
          <span>Total</span>
          <span>{formatPrice(order.totalAmount)}</span>
        </div>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionHeading}>Delivery Address</h2>
        <p className={styles.address}>
          {order.shippingAddress.name}
          <br />
          {order.shippingAddress.addressLine}
          {order.shippingAddress.building ? `, ${order.shippingAddress.building}` : ''}
          <br />
          {order.shippingAddress.landmark && (
            <>
              {order.shippingAddress.landmark}
              <br />
            </>
          )}
          {order.shippingAddress.city}, {order.shippingAddress.state} {order.shippingAddress.pincode}
          <br />
          {order.shippingAddress.mobileNumber}
        </p>
      </section>

      {order.shipment && (
        <section className={styles.section}>
          <h2 className={styles.sectionHeading}>Shipment</h2>
          <p className={styles.shipment}>
            {order.shipment.courierName ?? order.shipment.provider} — {formatStatus(order.shipment.status)}
          </p>
          {order.shipment.trackingNumber && (
            <p className={styles.shipment}>Tracking: {order.shipment.trackingNumber}</p>
          )}
        </section>
      )}

      <section className={styles.section}>
        <h2 className={styles.sectionHeading}>Order Timeline</h2>
        <ul className={styles.timeline}>
          {order.statusHistory.map((h, i) => (
            <li key={i} className={styles.timelineItem}>
              <div className={styles.timelineRow}>
                <span className={styles.timelineStatus}>{formatStatus(h.status)}</span>
                <span className={styles.timelineDate}>
                  {new Date(h.createdAt).toLocaleString('en-IN', {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  })}
                </span>
              </div>
              {h.note && <p className={styles.timelineNote}>{h.note}</p>}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
