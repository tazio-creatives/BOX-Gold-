import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { fetchCart, updateCartItem, removeCartItem } from '../api/cart';
import { addWishlistItem } from '../api/wishlist';
import { applyCoupon } from '../api/coupons';
import { fetchProducts } from '../api/products';
import type { Cart, CartItem } from '../api/types';
import { productUrl } from '../utils/productUrl';
import { formatPrice } from '../utils/formatPrice';
import { effectiveMrp } from '../utils/effectiveMrp';
import { placeholderGradient } from '../utils/placeholderGradient';
import { useDocumentTitle } from '../utils/useDocumentTitle';
import { ApiError } from '../api/client';
import { Breadcrumbs } from '../components/Breadcrumbs';
import { TrustStripBar, CART_ASSURANCE_ITEMS } from '../components/TrustStripBar';
import { RelatedProducts } from '../features/pdp/RelatedProducts';
import { OrderSummary } from '../features/checkout/OrderSummary';
import styles from './CartPage.module.css';
import placeholderStyles from './PlaceholderPage.module.css';

// Size is shown as its own dedicated line on the cart card (matches the
// approved reference design) — everything else (metal, diamond config)
// stays on one combined meta line above it.
function metaLine(item: CartItem): string {
  const parts: string[] = [];
  if (item.metalType === 'GOLD') {
    const color = item.goldColor ? item.goldColor.charAt(0) + item.goldColor.slice(1).toLowerCase() : '';
    parts.push([item.purity, color, 'Gold'].filter(Boolean).join(' '));
  } else {
    parts.push(item.purity ? `${item.purity} Platinum` : 'Platinum');
  }
  if (item.diamondConfigName) parts.push(item.diamondConfigName);
  return parts.join('  ·  ');
}

function sizeLabel(item: CartItem): string | null {
  const size = item.sizeLabel ?? item.productSize;
  return size ? `Size : ${size}` : null;
}

// Same estimate wording as the PDP's DeliveryChecker (post-pincode-check
// state) — kept consistent across surfaces rather than inventing new copy.
function deliveryLabel(item: CartItem): string {
  return item.isBackordered
    ? 'Made to order — delivery in 7–10 working days'
    : 'Delivery in 3–7 business days';
}

function CloseIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
    </svg>
  );
}

function HeartIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M12 21s-7.5-4.7-10-9.3C.5 8.1 2.3 4.5 6 4c2-.3 3.7.6 6 3 2.3-2.4 4-3.3 6-3 3.7.5 5.5 4.1 4 7.7C19.5 16.3 12 21 12 21z" />
    </svg>
  );
}

function BagIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M6 8h12l-1 12H7L6 8z" />
      <path d="M9 8V6a3 3 0 0 1 6 0v2" />
    </svg>
  );
}

function TruckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
      <path d="M2 7h11v10H2z" />
      <path d="M13 10h4l4 3v4h-8z" />
      <circle cx="6" cy="19" r="1.7" />
      <circle cx="17" cy="19" r="1.7" />
    </svg>
  );
}

function EmptyBagIllustration() {
  return (
    <svg width="72" height="72" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.25" aria-hidden="true">
      <path d="M6 8h12l-1 12H7L6 8z" />
      <path d="M9 8V6a3 3 0 0 1 6 0v2" />
      <path d="M9.5 12.5l1.5 1.5 3-3" strokeLinecap="round" strokeLinejoin="round" opacity="0.5" />
    </svg>
  );
}

export function CartPage() {
  useDocumentTitle('Shopping Bag');
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [couponInput, setCouponInput] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState<{ code: string; discountAmount: number } | null>(null);
  const [couponError, setCouponError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState('');
  // Mobile sticky checkout bar must never sit on top of the footer (unlike
  // the PDP purchase bar, which the user explicitly asked to keep visible
  // there) — hide it once the footer scrolls into view.
  const [hideStickyBarForFooter, setHideStickyBarForFooter] = useState(false);

  useEffect(() => {
    const footerEl = document.querySelector('footer');
    if (!footerEl) return undefined;
    const observer = new IntersectionObserver(([entry]) => setHideStickyBarForFooter(entry.isIntersecting));
    observer.observe(footerEl);
    return () => observer.disconnect();
  }, []);

  const { data, isLoading } = useQuery({ queryKey: ['cart'], queryFn: fetchCart });

  const { data: featuredData } = useQuery({
    queryKey: ['best-sellers-cart'],
    queryFn: () => fetchProducts({ sort: 'bestseller', limit: 8 }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ variantId, quantity }: { variantId: string; quantity: number }) =>
      updateCartItem(variantId, quantity),
    onSuccess: (cart: Cart) => queryClient.setQueryData(['cart'], cart),
  });

  const removeMutation = useMutation({
    mutationFn: ({ variantId }: { variantId: string; name: string }) => removeCartItem(variantId),
    onSuccess: (cart: Cart, { name }) => {
      queryClient.setQueryData(['cart'], cart);
      setStatusMessage(`${name} removed from your bag.`);
    },
  });

  const moveToWishlistMutation = useMutation({
    mutationFn: async ({ productId, variantId }: { productId: string; variantId: string; name: string }) => {
      await addWishlistItem(productId);
      return removeCartItem(variantId);
    },
    onSuccess: (cart: Cart, { name }) => {
      queryClient.setQueryData(['cart'], cart);
      queryClient.invalidateQueries({ queryKey: ['wishlist'] });
      setStatusMessage(`${name} moved to your wishlist.`);
    },
    onError: (err) => {
      setStatusMessage(
        err instanceof ApiError && err.status === 401
          ? 'Sign in to move items to your wishlist.'
          : 'Could not move item to wishlist.',
      );
    },
  });

  const applyCouponMutation = useMutation({
    mutationFn: (subtotal: number) => applyCoupon(couponInput, subtotal),
    onSuccess: (result) => {
      setAppliedCoupon({ code: result.coupon.code, discountAmount: result.discountAmount });
      setCouponError(null);
      setStatusMessage(`Coupon ${result.coupon.code} applied.`);
    },
    onError: (err) => {
      setAppliedCoupon(null);
      const message = err instanceof ApiError ? err.message : 'Could not apply coupon.';
      setCouponError(message);
      setStatusMessage(`Coupon error: ${message}`);
    },
  });

  const statusRegion = (
    <p role="status" aria-live="polite" className={styles.visuallyHidden}>
      {statusMessage}
    </p>
  );

  if (isLoading) {
    return (
      <div className={styles.page} aria-busy="true">
        <Breadcrumbs items={[{ label: 'Cart' }]} />
        <h1 className={styles.heading}>Shopping Bag</h1>
        <div className={styles.layout}>
          <div className={styles.mainColumn}>
            <ul className={styles.list}>
              {Array.from({ length: 3 }).map((_, i) => (
                <li key={i} className={styles.row}>
                  <div className={styles.skeletonImage} />
                  <div className={styles.skeletonDetails}>
                    <div className={styles.skeletonLine} style={{ width: '60%', height: 18 }} />
                    <div className={styles.skeletonLine} style={{ width: '40%' }} />
                    <div className={styles.skeletonLine} style={{ width: '30%' }} />
                  </div>
                </li>
              ))}
            </ul>
          </div>
          <div className={styles.skeletonSummary} />
        </div>
      </div>
    );
  }

  if (!data || data.items.length === 0) {
    return (
      <div className={styles.page}>
        <Breadcrumbs items={[{ label: 'Cart' }]} />
        <div className={styles.emptyState}>
          <div className={styles.emptyIcon}>
            <EmptyBagIllustration />
          </div>
          <h1 className={placeholderStyles.heading}>Your shopping bag is empty</h1>
          <p className={styles.emptyBody}>Discover jewellery made for every moment.</p>
          <div className={styles.emptyActions}>
            <Link to="/" className={styles.emptyPrimaryButton}>
              Continue Shopping
            </Link>
            <Link to="/wishlist" className={styles.emptySecondaryButton}>
              View Wishlist
            </Link>
          </div>
        </div>

        <RelatedProducts products={featuredData?.products ?? []} categorySlug={null} heading="Best Sellers" />
      </div>
    );
  }

  function changeQuantity(item: CartItem, quantity: number) {
    if (quantity <= 0) {
      removeMutation.mutate({ variantId: item.variantId, name: item.name });
    } else {
      updateMutation.mutate({ variantId: item.variantId, quantity });
    }
  }

  const preTaxSubtotal = Math.max(data.subtotal - data.gstAmount, 0);
  const gstPercent = preTaxSubtotal > 0 ? Math.round((data.gstAmount / preTaxSubtotal) * 100) : 0;
  const discountAmount = appliedCoupon?.discountAmount ?? 0;
  const total = Math.max(data.subtotal - discountAmount, 0);
  const MAX_LINE_QUANTITY = 20; // mirrors the backend's addCartItemSchema/updateCartItemSchema cap
  const itemCountLabel = `${data.itemCount} ${data.itemCount === 1 ? 'item' : 'items'}`;
  // Sum of every line's (strike-through MRP - selling price) — the coupon
  // discount is tracked separately and shown as its own row.
  const savingsAmount = data.items.reduce((sum, item) => {
    const { strikePrice } = effectiveMrp(item.sellingPrice, item.mrp, item.sellingPriceOriginal);
    return sum + Math.max(strikePrice - item.sellingPrice, 0) * item.quantity;
  }, 0);

  return (
    <div className={styles.page}>
      {statusRegion}
      <Breadcrumbs items={[{ label: 'Cart' }]} />

      <h1 className={styles.heading}>Shopping Bag</h1>
      <p className={styles.itemCountLabel}>{itemCountLabel}</p>

      <div className={styles.layout}>
        <div className={styles.mainColumn}>
          <ul className={styles.list}>
            {data.items.map((item, i) => {
                const rowKey = item.variantId;
                const isUpdating = updateMutation.isPending && updateMutation.variables.variantId === rowKey;
                const isRemoving = removeMutation.isPending && removeMutation.variables.variantId === rowKey;
                const isMovingToWishlist =
                  moveToWishlistMutation.isPending && moveToWishlistMutation.variables.variantId === rowKey;
                const rowBusy = isUpdating || isRemoving || isMovingToWishlist;
                const { strikePrice, discountPercent } = effectiveMrp(item.sellingPrice, item.mrp, item.sellingPriceOriginal);
                const size = sizeLabel(item);

                return (
                  <li key={item.variantId} className={styles.row} aria-busy={rowBusy || undefined}>
                    <button
                      type="button"
                      className={styles.removeButton}
                      aria-label={`Remove ${item.name} from bag`}
                      disabled={rowBusy}
                      onClick={() => removeMutation.mutate({ variantId: item.variantId, name: item.name })}
                    >
                      <CloseIcon />
                    </button>

                    <Link
                      to={productUrl({ slug: item.slug, categorySlug: item.categorySlug })}
                      className={styles.imageLink}
                    >
                      <div
                        className={styles.image}
                        style={item.primaryImageUrl ? undefined : { background: placeholderGradient(i) }}
                      >
                        {item.primaryImageUrl && (
                          <img src={item.primaryImageUrl} alt={item.name} className={styles.imageTag} />
                        )}
                        {discountPercent > 0 && <span className={styles.discountBadge}>{discountPercent}% OFF</span>}
                      </div>
                    </Link>

                    <div className={styles.details}>
                      <Link
                        to={productUrl({ slug: item.slug, categorySlug: item.categorySlug })}
                        className={styles.name}
                      >
                        {item.name}
                      </Link>

                      <p className={styles.meta}>{metaLine(item)}</p>
                      {size && <p className={styles.sizeRow}>{size}</p>}

                      <p className={styles.price}>
                        {formatPrice(item.sellingPrice)}
                        {strikePrice > 0 && <span className={styles.priceOld}>{formatPrice(strikePrice)}</span>}
                      </p>

                      <p className={item.isBackordered ? styles.deliveryBadgeBackorder : styles.deliveryBadge}>
                        <TruckIcon />
                        {deliveryLabel(item)}
                      </p>

                      <div className={styles.rowFooter}>
                        <div className={styles.stepper}>
                          <button
                            type="button"
                            disabled={rowBusy}
                            onClick={() => changeQuantity(item, item.quantity - 1)}
                            aria-label={`Decrease quantity of ${item.name}`}
                          >
                            −
                          </button>
                          <span aria-live="polite">{isUpdating ? '…' : item.quantity}</span>
                          <button
                            type="button"
                            onClick={() => changeQuantity(item, item.quantity + 1)}
                            disabled={rowBusy || item.quantity >= MAX_LINE_QUANTITY}
                            aria-label={`Increase quantity of ${item.name}`}
                          >
                            +
                          </button>
                        </div>

                        {item.quantity > 1 && (
                          <span className={styles.lineTotal}>{formatPrice(item.lineTotal)}</span>
                        )}
                      </div>

                      <button
                        type="button"
                        className={styles.wishlistAction}
                        disabled={rowBusy}
                        onClick={() =>
                          moveToWishlistMutation.mutate({
                            productId: item.productId,
                            variantId: item.variantId,
                            name: item.name,
                          })
                        }
                      >
                        <HeartIcon />
                        {isMovingToWishlist ? 'Moving…' : 'Move to Wishlist'}
                      </button>
                    </div>
                  </li>
                );
              })}
          </ul>

          <TrustStripBar variant="boxed" items={CART_ASSURANCE_ITEMS} />
        </div>

        <div className={styles.summaryColumn}>
          <OrderSummary
            itemCount={data.itemCount}
            subtotal={preTaxSubtotal}
            savingsAmount={savingsAmount}
            discountAmount={discountAmount}
            gstAmount={data.gstAmount}
            gstPercent={gstPercent}
            total={total}
            couponInput={couponInput}
            onCouponInputChange={setCouponInput}
            appliedCoupon={appliedCoupon}
            couponError={couponError}
            isApplyingCoupon={applyCouponMutation.isPending}
            onApplyCoupon={() => applyCouponMutation.mutate(data.subtotal)}
            onRemoveCoupon={() => {
              setAppliedCoupon(null);
              setCouponInput('');
              setCouponError(null);
              setStatusMessage('Coupon removed.');
            }}
            errorMessage={null}
            primaryAction={{
              label: 'Proceed to Checkout',
              icon: <BagIcon />,
              onClick: () => navigate('/checkout'),
            }}
            secondaryAction={{
              label: 'Continue Shopping',
              onClick: () => navigate('/'),
            }}
            showTrustList={false}
            hidePrimaryOnMobile
          />
        </div>
      </div>

      <RelatedProducts products={featuredData?.products ?? []} categorySlug={null} heading="Best Sellers" />

      {/* Mobile-only (CSS): the sticky checkout bar is the single source of
          truth for "Proceed to Checkout" below 768px — OrderSummary's own
          primaryAction hides itself there (hidePrimaryOnMobile) so there's
          never a duplicate button. */}
      <div className={`${styles.stickyBar} ${hideStickyBarForFooter ? styles.stickyBarHidden : ''}`}>
        <div className={styles.stickyBarTotal}>
          <p className={styles.stickyBarLabel}>Total ({itemCountLabel})</p>
          <p className={styles.stickyBarValue}>{formatPrice(total)}</p>
        </div>
        <button type="button" className={styles.stickyBarButton} onClick={() => navigate('/checkout')}>
          Proceed to Checkout
        </button>
      </div>
    </div>
  );
}
