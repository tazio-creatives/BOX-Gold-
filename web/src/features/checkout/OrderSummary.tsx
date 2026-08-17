import type { ReactNode } from 'react';
import { formatPrice } from '../../utils/formatPrice';
import { placeholderGradient } from '../../utils/placeholderGradient';
import styles from './OrderSummary.module.css';

export interface OrderSummaryItem {
  id: string;
  name: string;
  qty: number;
  image: string | null;
  price: number;
}

export interface OrderSummaryAction {
  label: string;
  icon?: ReactNode;
  onClick: () => void;
  disabled?: boolean;
}

interface OrderSummaryProps {
  items?: OrderSummaryItem[];
  itemCount: number;
  subtotal: number;
  discountAmount: number;
  gstAmount: number;
  gstPercent: number;
  total: number;
  couponInput: string;
  onCouponInputChange: (value: string) => void;
  appliedCoupon: { code: string } | null;
  couponError: string | null;
  isApplyingCoupon: boolean;
  onApplyCoupon: () => void;
  onRemoveCoupon: () => void;
  errorMessage?: string | null;
  primaryAction?: OrderSummaryAction;
  secondaryAction?: OrderSummaryAction;
}

function ShieldIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M12 3l7 3v6c0 4.5-3 7.7-7 9-4-1.3-7-4.5-7-9V6l7-3z" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  );
}

function TruckIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M2 7h11v10H2z" />
      <path d="M13 10h4l4 3v4h-8z" />
      <circle cx="6" cy="19" r="1.7" />
      <circle cx="17" cy="19" r="1.7" />
    </svg>
  );
}

function CertifiedIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M12 2l2.4 1.4 2.8-.2 1 2.6 2.4 1.4-.6 2.8.6 2.8-2.4 1.4-1 2.6-2.8-.2L12 18l-2.4 1.4-2.8.2-1-2.6-2.4-1.4.6-2.8-.6-2.8 2.4-1.4 1-2.6 2.8.2L12 2z" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  );
}

const TRUST_ITEMS = [
  { Icon: ShieldIcon, title: '100% Secure Payments', subtitle: 'Your payment information is safe with us.' },
  { Icon: TruckIcon, title: 'Free Insured Shipping', subtitle: 'Delivered safely to your doorstep.' },
  { Icon: CertifiedIcon, title: 'Certified Diamonds', subtitle: 'IGI / SGL certified jewellery.' },
];

export function OrderSummary({
  items,
  itemCount,
  subtotal,
  discountAmount,
  gstAmount,
  gstPercent,
  total,
  couponInput,
  onCouponInputChange,
  appliedCoupon,
  couponError,
  isApplyingCoupon,
  onApplyCoupon,
  onRemoveCoupon,
  errorMessage,
  primaryAction,
  secondaryAction,
}: OrderSummaryProps) {
  return (
    <aside className={styles.card}>
      <h2 className={styles.heading}>Order Summary</h2>

      {items && items.length > 0 && (
        <ul className={styles.itemList}>
          {items.map((item, i) => (
            <li key={item.id} className={styles.item}>
              <div
                className={styles.itemImage}
                style={item.image ? undefined : { background: placeholderGradient(i) }}
              >
                {item.image && <img src={item.image} alt={item.name} className={styles.itemImageTag} />}
              </div>
              <div className={styles.itemDetails}>
                <p className={styles.itemName}>{item.name}</p>
                <p className={styles.itemQty}>Qty: {item.qty}</p>
              </div>
              <p className={styles.itemPrice}>{formatPrice(item.price * item.qty)}</p>
            </li>
          ))}
        </ul>
      )}

      <div className={styles.priceRows}>
        <div className={styles.priceRow}>
          <span>
            Subtotal ({itemCount} {itemCount === 1 ? 'item' : 'items'})
          </span>
          <span>{formatPrice(subtotal)}</span>
        </div>
        {discountAmount > 0 && (
          <div className={styles.priceRow}>
            <span>Discount</span>
            <span className={styles.discountValue}>- {formatPrice(discountAmount)}</span>
          </div>
        )}
        <div className={styles.priceRow}>
          <span>Shipping</span>
          <span className={styles.freeValue}>FREE</span>
        </div>
        <div className={styles.priceRow}>
          <span>GST ({gstPercent}%)</span>
          <span>{formatPrice(gstAmount)}</span>
        </div>
      </div>

      <div className={styles.totalRow}>
        <span>Total</span>
        <span className={styles.totalValue}>{formatPrice(total)}</span>
      </div>

      <div className={styles.couponRow}>
        {appliedCoupon ? (
          <div className={styles.couponApplied}>
            <span>
              Coupon <strong>{appliedCoupon.code}</strong> applied
            </span>
            <button type="button" className={styles.couponRemove} onClick={onRemoveCoupon}>
              Remove
            </button>
          </div>
        ) : (
          <div className={styles.couponInputRow}>
            <input
              className={styles.couponInput}
              placeholder="Enter Coupon Code"
              value={couponInput}
              onChange={(e) => onCouponInputChange(e.target.value)}
            />
            <button
              type="button"
              className={styles.couponApplyButton}
              disabled={!couponInput.trim() || isApplyingCoupon}
              onClick={onApplyCoupon}
            >
              {isApplyingCoupon ? 'Applying…' : 'Apply'}
            </button>
          </div>
        )}
        {couponError && <p className={styles.error}>{couponError}</p>}
      </div>

      {errorMessage && <p className={styles.error}>{errorMessage}</p>}

      {primaryAction && (
        <button
          type="button"
          className={styles.primaryAction}
          disabled={primaryAction.disabled}
          onClick={primaryAction.onClick}
        >
          {primaryAction.icon}
          {primaryAction.label}
        </button>
      )}

      {secondaryAction && (
        <button
          type="button"
          className={styles.secondaryAction}
          disabled={secondaryAction.disabled}
          onClick={secondaryAction.onClick}
        >
          {secondaryAction.icon}
          {secondaryAction.label}
        </button>
      )}

      <ul className={styles.trustList}>
        {TRUST_ITEMS.map(({ Icon, title, subtitle }) => (
          <li key={title} className={styles.trustItem}>
            <span className={styles.trustIcon}>
              <Icon />
            </span>
            <div>
              <p className={styles.trustTitle}>{title}</p>
              <p className={styles.trustSubtitle}>{subtitle}</p>
            </div>
          </li>
        ))}
      </ul>
    </aside>
  );
}
