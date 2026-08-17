import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { fetchOrderById } from '../api/orders';
import { formatPrice } from '../utils/formatPrice';
import { placeholderGradient } from '../utils/placeholderGradient';
import { useDocumentTitle } from '../utils/useDocumentTitle';
import styles from './OrderConfirmationPage.module.css';
import placeholderStyles from './PlaceholderPage.module.css';

function CheckIcon() {
  return (
    <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function PrintIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M6 9V3h12v6" />
      <rect x="4" y="9" width="16" height="8" rx="1.5" />
      <path d="M6 14h12v7H6z" />
    </svg>
  );
}

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

function itemMetaLine(item: { purity: string | null; goldColor: string | null; sizeLabel: string | null; diamondConfigName: string | null }) {
  const parts: string[] = [];
  if (item.purity || item.goldColor) {
    const color = item.goldColor ? item.goldColor.charAt(0) + item.goldColor.slice(1).toLowerCase() : '';
    parts.push([item.purity, color].filter(Boolean).join(' '));
  }
  if (item.sizeLabel) parts.push(`Size: ${item.sizeLabel}`);
  if (item.diamondConfigName) parts.push(item.diamondConfigName);
  return parts.join(' · ');
}

export function OrderConfirmationPage() {
  const { orderId } = useParams<{ orderId: string }>();
  const { data, isLoading, isError } = useQuery({
    queryKey: ['order', orderId],
    queryFn: () => fetchOrderById(orderId as string),
    enabled: !!orderId,
  });

  useDocumentTitle(data ? `Order ${data.order.orderNumber}` : 'Order Confirmation');

  if (isLoading) {
    return (
      <div className={styles.page} aria-busy="true">
        <div className={styles.banner}>
          <div className={styles.skeletonLine} style={{ width: 260, height: 24, marginBottom: 12 }} />
          <div className={styles.skeletonLine} style={{ width: 160 }} />
        </div>
        <div className={styles.skeletonContent} />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className={placeholderStyles.container}>
        <h1 className={placeholderStyles.heading}>Order not found</h1>
        <p className={placeholderStyles.body}>We couldn't find that order.</p>
      </div>
    );
  }

  const { order } = data;
  const isConfirmed = order.status !== 'PENDING_PAYMENT' && order.status !== 'PAYMENT_FAILED';
  const orderDate = new Date(order.createdAt).toLocaleDateString('en-IN', { dateStyle: 'medium' });

  return (
    <div className={styles.page}>
      <div className={isConfirmed ? styles.banner : styles.bannerPending}>
        <span className={isConfirmed ? styles.iconBadge : styles.iconBadgePending}>
          {isConfirmed ? <CheckIcon /> : <ClockIcon />}
        </span>
        <h1 className={styles.heading}>{isConfirmed ? 'Thank you for your order!' : 'Order Received'}</h1>
        <Link to="/" className={styles.continueLink}>
          Continue Shopping
        </Link>
      </div>

      <div className={styles.receipt}>
        <div className={styles.receiptHeader}>
          <div>
            <p className={styles.receiptOrderId}>Order ID : {order.orderNumber}</p>
            <p className={styles.receiptMeta}>
              Order Date : {orderDate}
              <span className={styles.receiptDivider}>|</span>
              <span className={`${styles.statusBadge} ${styles[STATUS_CLASS[order.status] ?? 'statusPending']}`}>
                {formatStatus(order.status)}
              </span>
            </p>
          </div>
          <div className={styles.receiptActions}>
            <button type="button" className={styles.printButton} onClick={() => window.print()}>
              <PrintIcon />
              Print
            </button>
            <Link to={`/account/orders/${order.id}`} className={styles.detailsButton}>
              View Order Details
            </Link>
          </div>
        </div>

        <ul className={styles.itemList}>
          {order.items.map((item, i) => {
            const meta = itemMetaLine(item);
            return (
              <li key={item.id} className={styles.item}>
                <div className={styles.itemThumb} style={{ background: placeholderGradient(i) }} />
                <div className={styles.itemInfo}>
                  <p className={styles.itemName}>{item.productName}</p>
                  {meta && <p className={styles.itemVariant}>{meta}</p>}
                </div>
                <div className={styles.itemTrailing}>
                  <p className={styles.itemPrice}>{formatPrice(item.lineTotal)}</p>
                  <p className={styles.itemQty}>Qty: {item.quantity}</p>
                </div>
              </li>
            );
          })}
        </ul>

        <div className={styles.infoRow}>
          <div className={styles.infoCol}>
            <p className={styles.infoLabel}>Delivery Address</p>
            <p className={styles.infoValue}>
              {order.shippingAddress.name}
              <br />
              {order.shippingAddress.addressLine}
              {order.shippingAddress.building ? `, ${order.shippingAddress.building}` : ''}
              <br />
              {order.shippingAddress.city}, {order.shippingAddress.state} {order.shippingAddress.pincode}
            </p>
          </div>
          {order.shipment && (
            <div className={styles.infoCol}>
              <p className={styles.infoLabel}>Shipment</p>
              <p className={styles.infoValue}>
                {order.shipment.courierName ?? order.shipment.provider} — {formatStatus(order.shipment.status)}
                {order.shipment.trackingNumber && (
                  <>
                    <br />
                    Tracking: {order.shipment.trackingNumber}
                  </>
                )}
              </p>
            </div>
          )}
          <div className={styles.infoCol}>
            <p className={styles.infoLabel}>Contact</p>
            <p className={styles.infoValue}>
              {order.contactName}
              <br />
              {order.contactMobile}
            </p>
          </div>
        </div>

        <div className={styles.footerRow}>
          <div className={styles.helpCol}>
            <p className={styles.infoLabel}>Need help?</p>
            <Link to="/contact" className={styles.helpLink}>
              Contact Support →
            </Link>
          </div>

          <div className={styles.costCol}>
            <div className={styles.costRow}>
              <span>Item Cost</span>
              <span>{formatPrice(order.subtotal)}</span>
            </div>
            <div className={styles.costRow}>
              <span>Shipping</span>
              <span>{order.shippingAmount > 0 ? formatPrice(order.shippingAmount) : 'Free'}</span>
            </div>
            <div className={styles.costRow}>
              <span>Tax (GST)</span>
              <span>{formatPrice(order.gstAmount)}</span>
            </div>
            {order.discountAmount > 0 && (
              <div className={styles.costRow}>
                <span>Coupon{order.couponCode ? ` (${order.couponCode})` : ''}</span>
                <span className={styles.discountValue}>- {formatPrice(order.discountAmount)}</span>
              </div>
            )}
            <div className={styles.totalRow}>
              <span>Total Cost</span>
              <span>{formatPrice(order.totalAmount)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
