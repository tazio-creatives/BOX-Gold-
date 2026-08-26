import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { fetchCart, updateCartItem, removeCartItem } from '../api/cart';
import { addWishlistItem } from '../api/wishlist';
import { applyCoupon } from '../api/coupons';
import { fetchProducts } from '../api/products';
import type { Cart, CartItem, VariantSelection } from '../api/types';
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

function metaLine(item: CartItem): string {
  const parts: string[] = [];
  if (item.metalType === 'GOLD') {
    const color = item.goldColor ? item.goldColor.charAt(0) + item.goldColor.slice(1).toLowerCase() : '';
    parts.push([item.purity, color, 'Gold'].filter(Boolean).join(' '));
  } else {
    parts.push(item.purity ? `${item.purity} Platinum` : 'Platinum');
  }
  const size = item.sizeLabel ?? item.productSize;
  if (size) parts.push(`Size: ${size}`);
  if (item.diamondConfigName) parts.push(item.diamondConfigName);
  return parts.join('  ·  ');
}

function itemVariant(item: CartItem): VariantSelection {
  return {
    sizeId: item.sizeId,
    goldColor: item.cartGoldColor,
    purity: item.cartPurity,
    diamondConfigId: item.cartDiamondConfigId,
  };
}

function itemKey(item: CartItem): string {
  return [item.productId, item.sizeId, item.goldColor, item.purity, item.diamondConfigId]
    .map((v) => v ?? '')
    .join(':');
}

// Correlates a pending mutation back to the specific row it's acting on —
// built from the same {productId, variant} shape sent to the API, not
// itemKey (which uses display-defaulted fields the mutation doesn't see).
function mutationKey(productId: string, variant: VariantSelection): string {
  return [productId, variant.sizeId, variant.goldColor, variant.purity, variant.diamondConfigId]
    .map((v) => v ?? '')
    .join(':');
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
    queryKey: ['featured-products-cart'],
    queryFn: () => fetchProducts({ sort: 'featured', limit: 8 }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ productId, variant, quantity }: { productId: string; variant: VariantSelection; quantity: number }) =>
      updateCartItem(productId, quantity, variant),
    onSuccess: (cart: Cart) => queryClient.setQueryData(['cart'], cart),
  });

  const removeMutation = useMutation({
    mutationFn: ({ productId, variant }: { productId: string; variant: VariantSelection; name: string }) =>
      removeCartItem(productId, variant),
    onSuccess: (cart: Cart, { name }) => {
      queryClient.setQueryData(['cart'], cart);
      setStatusMessage(`${name} removed from your bag.`);
    },
  });

  const moveToWishlistMutation = useMutation({
    mutationFn: async ({ productId, variant }: { productId: string; variant: VariantSelection; name: string }) => {
      await addWishlistItem(productId);
      return removeCartItem(productId, variant);
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
            <div className={styles.cartCard}>
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

        <RelatedProducts products={featuredData?.products ?? []} categorySlug={null} />
      </div>
    );
  }

  function changeQuantity(item: CartItem, quantity: number) {
    if (quantity <= 0) {
      removeMutation.mutate({ productId: item.productId, variant: itemVariant(item), name: item.name });
    } else {
      updateMutation.mutate({ productId: item.productId, variant: itemVariant(item), quantity });
    }
  }

  const preTaxSubtotal = Math.max(data.subtotal - data.gstAmount, 0);
  const gstPercent = preTaxSubtotal > 0 ? Math.round((data.gstAmount / preTaxSubtotal) * 100) : 0;
  const discountAmount = appliedCoupon?.discountAmount ?? 0;
  const total = Math.max(data.subtotal - discountAmount, 0);
  const MAX_LINE_QUANTITY = 20; // mirrors the backend's addCartItemSchema/updateCartItemSchema cap
  const itemCountLabel = `${data.itemCount} ${data.itemCount === 1 ? 'item' : 'items'}`;

  return (
    <div className={styles.page}>
      {statusRegion}
      <Breadcrumbs items={[{ label: 'Cart' }]} />

      <h1 className={styles.heading}>Shopping Bag</h1>
      <p className={styles.itemCountLabel}>{itemCountLabel}</p>

      <div className={styles.layout}>
        <div className={styles.mainColumn}>
          <div className={styles.cartCard}>
            <ul className={styles.list}>
              {data.items.map((item, i) => {
                const variant = itemVariant(item);
                const rowKey = mutationKey(item.productId, variant);
                const isUpdating =
                  updateMutation.isPending &&
                  mutationKey(updateMutation.variables.productId, updateMutation.variables.variant) === rowKey;
                const isRemoving =
                  removeMutation.isPending &&
                  mutationKey(removeMutation.variables.productId, removeMutation.variables.variant) === rowKey;
                const isMovingToWishlist =
                  moveToWishlistMutation.isPending &&
                  mutationKey(moveToWishlistMutation.variables.productId, moveToWishlistMutation.variables.variant) ===
                    rowKey;
                const rowBusy = isUpdating || isRemoving || isMovingToWishlist;
                const { strikePrice } = effectiveMrp(item.sellingPrice, item.mrp, item.sellingPriceOriginal);

                return (
                  <li key={itemKey(item)} className={styles.row} aria-busy={rowBusy || undefined}>
                    <button
                      type="button"
                      className={styles.removeButton}
                      aria-label={`Remove ${item.name} from bag`}
                      disabled={rowBusy}
                      onClick={() => removeMutation.mutate({ productId: item.productId, variant, name: item.name })}
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

                      <p className={styles.price}>
                        {formatPrice(item.sellingPrice)}
                        {strikePrice > 0 && <span className={styles.priceOld}>{formatPrice(strikePrice)}</span>}
                      </p>

                      {item.isBackordered && (
                        <p className={styles.backorderNotice}>Make to Order — ships in 7–10 working days</p>
                      )}

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
                          moveToWishlistMutation.mutate({ productId: item.productId, variant, name: item.name })
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
          </div>

          <TrustStripBar variant="boxed" items={CART_ASSURANCE_ITEMS} />
        </div>

        <div className={styles.summaryColumn}>
          <OrderSummary
            itemCount={data.itemCount}
            subtotal={preTaxSubtotal}
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

      <RelatedProducts products={featuredData?.products ?? []} categorySlug={null} />

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
