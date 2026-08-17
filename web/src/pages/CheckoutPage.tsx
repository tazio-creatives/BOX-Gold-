import { useEffect, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { useCustomer } from '../features/auth/useCustomer';
import { fetchCart } from '../api/cart';
import { fetchAddresses, createAddress } from '../api/addresses';
import { submitCheckout } from '../api/checkout';
import { simulatePayment } from '../api/payments';
import { applyCoupon } from '../api/coupons';
import { AddressForm } from '../features/address/AddressForm';
import { AddressCard } from '../features/address/AddressCard';
import { OrderSummary } from '../features/checkout/OrderSummary';
import { StepIndicator } from '../features/checkout/StepIndicator';
import { Breadcrumbs } from '../components/Breadcrumbs';
import { TrustStripBar } from '../components/TrustStripBar';
import type { AddressInput, BuyNowItem, CheckoutResponse } from '../api/types';
import { formatPrice } from '../utils/formatPrice';
import { placeholderGradient } from '../utils/placeholderGradient';
import { useDocumentTitle } from '../utils/useDocumentTitle';
import { ApiError } from '../api/client';
import styles from './CheckoutPage.module.css';
import placeholderStyles from './PlaceholderPage.module.css';

interface DisplayItem {
  productId: string;
  name: string;
  sellingPrice: number;
  quantity: number;
  primaryImageUrl: string | null;
  sizeId: string | null;
  sizeLabel: string | null;
  goldColor: string | null;
  purity: string | null;
  diamondConfigId: string | null;
  diamondConfigName: string | null;
}

interface ContactFieldErrors {
  name?: string;
  mobile?: string;
  email?: string;
  address?: string;
}

// Backend field paths (checkout.validators.js) mapped to plain-language
// messages — the raw Zod messages ("String must contain at least...") aren't
// something a shopper should have to parse.
const FIELD_ERROR_MESSAGES: Record<string, string> = {
  'contact.name': 'Please enter your full name.',
  'contact.mobile': 'Please enter a valid mobile number.',
  'contact.email': 'Please enter a valid email address.',
  addressId: 'Please select or add a delivery address.',
};

function SectionHeading({ number, title }: { number: number; title: string }) {
  return (
    <div className={styles.sectionHeadingRow}>
      <span className={styles.sectionNumber}>{number}</span>
      <h2 className={styles.sectionHeading}>{title}</h2>
    </div>
  );
}

function LockIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="4.5" y="10.5" width="15" height="10" rx="2" />
      <path d="M8 10.5V7a4 4 0 0 1 8 0v3.5" />
    </svg>
  );
}

export function CheckoutPage() {
  useDocumentTitle('Checkout');
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { customer, isLoggedIn, isLoading: isCustomerLoading } = useCustomer();

  const buyNow = (location.state as { buyNow?: BuyNowItem } | null)?.buyNow;

  const { data: cartData, isLoading: isCartLoading } = useQuery({
    queryKey: ['cart'],
    queryFn: fetchCart,
    enabled: !buyNow && isLoggedIn,
  });

  const { data: addressesData, isLoading: isAddressesLoading } = useQuery({
    queryKey: ['addresses'],
    queryFn: fetchAddresses,
    enabled: isLoggedIn,
  });

  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(null);
  const [isAddingAddress, setIsAddingAddress] = useState(false);
  const [contactName, setContactName] = useState(customer?.fullName ?? '');
  const [contactMobile, setContactMobile] = useState(customer?.mobileNumber ?? '');
  const [contactEmail, setContactEmail] = useState(customer?.email ?? '');

  // `customer` loads asynchronously (useCustomer's query), so it's often
  // still null on this component's first render — the useState initializers
  // above miss it. Fill the fields in once it arrives, without clobbering
  // anything the shopper has already typed.
  useEffect(() => {
    if (!customer) return;
    setContactName((prev) => prev || customer.fullName || '');
    setContactMobile((prev) => prev || customer.mobileNumber || '');
    setContactEmail((prev) => prev || customer.email || '');
  }, [customer]);
  const [orderResult, setOrderResult] = useState<CheckoutResponse | null>(null);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<ContactFieldErrors>({});
  const [couponInput, setCouponInput] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState<{ code: string; discountAmount: number } | null>(null);
  const [couponError, setCouponError] = useState<string | null>(null);

  const createAddressMutation = useMutation({
    mutationFn: (input: AddressInput) => createAddress(input),
    onSuccess: ({ address }) => {
      queryClient.invalidateQueries({ queryKey: ['addresses'] });
      setSelectedAddressId(address.id);
      setIsAddingAddress(false);
      setFieldErrors((prev) => ({ ...prev, address: undefined }));
    },
  });

  const checkoutMutation = useMutation({
    mutationFn: submitCheckout,
    onSuccess: (result) => {
      setOrderResult(result);
      queryClient.invalidateQueries({ queryKey: ['cart'] });
      // Stub gateway (plan §11) — confirm the payment immediately instead of
      // making the shopper click through a fake "Pay Now" step.
      payMutation.mutate({ providerRef: result.payment.providerRef, outcome: 'SUCCEEDED' });
    },
    onError: (err) => {
      if (err instanceof ApiError && err.fields && err.fields.length > 0) {
        const next: ContactFieldErrors = {};
        let unmapped = false;
        for (const field of err.fields) {
          const message = FIELD_ERROR_MESSAGES[field.path];
          if (message) {
            if (field.path === 'addressId') next.address = message;
            else if (field.path === 'contact.name') next.name = message;
            else if (field.path === 'contact.mobile') next.mobile = message;
            else if (field.path === 'contact.email') next.email = message;
          } else {
            unmapped = true;
          }
        }
        setFieldErrors(next);
        setCheckoutError(unmapped ? err.message : null);
        return;
      }
      setCheckoutError(err instanceof ApiError ? err.message : 'Could not place order.');
    },
  });

  const applyCouponMutation = useMutation({
    mutationFn: (subtotal: number) => applyCoupon(couponInput, subtotal),
    onSuccess: (result) => {
      setAppliedCoupon({ code: result.coupon.code, discountAmount: result.discountAmount });
      setCouponError(null);
    },
    onError: (err) => {
      setAppliedCoupon(null);
      setCouponError(err instanceof ApiError ? err.message : 'Could not apply coupon.');
    },
  });

  const payMutation = useMutation({
    mutationFn: ({ providerRef, outcome }: { providerRef: string; outcome: 'SUCCEEDED' | 'FAILED' }) =>
      simulatePayment(providerRef, outcome),
    onSuccess: (result) => {
      navigate(`/order-confirmation/${result.order.id}`);
    },
    onError: (err) => {
      setPaymentError(err instanceof ApiError ? err.message : 'Payment could not be processed.');
    },
  });

  if (!isCustomerLoading && !isLoggedIn) {
    return <Navigate to={`/login?redirect=${encodeURIComponent('/checkout')}`} replace />;
  }

  if (isCustomerLoading || isAddressesLoading || (!buyNow && isCartLoading)) {
    return (
      <div className={styles.page} aria-busy="true">
        <Breadcrumbs items={[{ label: 'Cart', href: '/cart' }, { label: 'Checkout' }]} />
        <div className={styles.hero}>
          <h1 className={styles.heading}>Checkout</h1>
          <StepIndicator currentStep={2} />
          <div className={styles.layout}>
            <div className={styles.sections}>
              <section className={styles.section}>
                <div className={styles.skeletonLine} style={{ width: 160, marginBottom: 16 }} />
                <div className={styles.skeletonInputRow}>
                  <div className={styles.skeletonInput} />
                  <div className={styles.skeletonInput} />
                  <div className={styles.skeletonInput} />
                </div>
              </section>
              <section className={styles.section}>
                <div className={styles.skeletonLine} style={{ width: 180, marginBottom: 16 }} />
                <div className={styles.skeletonAddressCard} />
              </section>
            </div>
            <div className={styles.skeletonSummary} />
          </div>
        </div>
      </div>
    );
  }

  const displayItems: DisplayItem[] = buyNow
    ? [
        {
          productId: buyNow.productId,
          name: buyNow.name,
          sellingPrice: buyNow.sellingPrice,
          quantity: buyNow.quantity,
          primaryImageUrl: buyNow.primaryImageUrl,
          sizeId: buyNow.sizeId ?? null,
          sizeLabel: buyNow.sizeLabel ?? null,
          goldColor: buyNow.goldColor ?? null,
          purity: buyNow.purity ?? null,
          diamondConfigId: buyNow.diamondConfigId ?? null,
          diamondConfigName: buyNow.diamondConfigName ?? null,
        },
      ]
    : (cartData?.items ?? []).map((i) => ({
        productId: i.productId,
        name: i.name,
        sellingPrice: i.sellingPrice,
        quantity: i.quantity,
        primaryImageUrl: i.primaryImageUrl,
        sizeId: i.sizeId,
        sizeLabel: i.sizeLabel,
        goldColor: i.goldColor,
        purity: i.purity,
        diamondConfigId: i.diamondConfigId,
        diamondConfigName: i.diamondConfigName,
      }));

  // GST-inclusive, same convention as Cart.subtotal.
  const subtotalInclGst = displayItems.reduce((sum, i) => sum + i.sellingPrice * i.quantity, 0);
  const gstAmount = buyNow ? buyNow.gstAmount : (cartData?.gstAmount ?? 0);
  const preTaxSubtotal = Math.max(subtotalInclGst - gstAmount, 0);
  const gstPercent = preTaxSubtotal > 0 ? Math.round((gstAmount / preTaxSubtotal) * 100) : 0;
  const discountAmount = appliedCoupon?.discountAmount ?? 0;
  const total = Math.max(subtotalInclGst - discountAmount, 0);

  const addresses = addressesData?.addresses ?? [];
  const activeAddressId = selectedAddressId ?? addresses.find((a) => a.isDefault)?.id ?? addresses[0]?.id ?? null;

  const summaryItems = displayItems.map((item) => {
    const variantBits = [item.sizeLabel ? `Size ${item.sizeLabel}` : null, item.diamondConfigName].filter(Boolean);
    return {
      id: [item.productId, item.sizeId, item.goldColor, item.purity, item.diamondConfigId].map((v) => v ?? '').join(':'),
      name: variantBits.length > 0 ? `${item.name} (${variantBits.join(', ')})` : item.name,
      qty: item.quantity,
      image: item.primaryImageUrl,
      price: item.sellingPrice,
    };
  });

  // Order is created — placing it redirects straight into the payment
  // gateway step (stub, plan §11), which confirms automatically and then
  // forwards to order confirmation, or shows a retry if that call fails.
  if (orderResult) {
    const { order } = orderResult;
    return (
      <div className={styles.page}>
        <Breadcrumbs items={[{ label: 'Cart', href: '/cart' }, { label: 'Checkout' }]} />
        <div className={styles.heroPlain}>
          <StepIndicator currentStep={3} />
          <div className={styles.paymentBox}>
            {paymentError ? (
              <>
                <p className={styles.paymentTotal}>{formatPrice(order.totalAmount)}</p>
                <p className={styles.paymentOrderNumber}>Order {order.orderNumber}</p>
                <p className={styles.error}>{paymentError}</p>
                <button
                  type="button"
                  className={styles.payButton}
                  disabled={payMutation.isPending}
                  onClick={() => {
                    setPaymentError(null);
                    payMutation.mutate({ providerRef: orderResult.payment.providerRef, outcome: 'SUCCEEDED' });
                  }}
                >
                  {payMutation.isPending ? 'Retrying…' : 'Try again'}
                </button>
              </>
            ) : (
              <>
                <span className={styles.spinner} aria-hidden="true" />
                <p className={styles.paymentGatewayTitle}>Redirecting to secure payment gateway…</p>
                <p className={styles.paymentTotal}>{formatPrice(order.totalAmount)}</p>
                <p className={styles.paymentOrderNumber}>Order {order.orderNumber}</p>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  function validateContactFields(): ContactFieldErrors {
    const errors: ContactFieldErrors = {};
    if (!contactName.trim()) errors.name = 'Please enter your full name.';
    if (!contactMobile.trim()) errors.mobile = 'Please enter your mobile number.';
    if (!contactEmail.trim()) errors.email = 'Please enter your email address.';
    return errors;
  }

  function handlePlaceOrder() {
    setCheckoutError(null);
    const nextFieldErrors = validateContactFields();
    if (!activeAddressId) {
      nextFieldErrors.address = 'Please select or add a delivery address.';
    }
    setFieldErrors(nextFieldErrors);
    if (Object.keys(nextFieldErrors).length > 0) return;
    if (displayItems.length === 0) {
      setCheckoutError('There is nothing to check out.');
      return;
    }
    checkoutMutation.mutate({
      contact: { name: contactName, mobile: contactMobile, email: contactEmail },
      addressId: activeAddressId,
      items: displayItems.map((i) => ({
        productId: i.productId,
        quantity: i.quantity,
        ...(i.sizeId ? { sizeId: i.sizeId } : {}),
        ...(i.goldColor ? { goldColor: i.goldColor } : {}),
        ...(i.purity ? { purity: i.purity } : {}),
        ...(i.diamondConfigId ? { diamondConfigId: i.diamondConfigId } : {}),
      })),
      ...(appliedCoupon ? { couponCode: appliedCoupon.code } : {}),
    });
  }

  if (displayItems.length === 0) {
    return (
      <div className={placeholderStyles.container}>
        <h1 className={placeholderStyles.heading}>Checkout</h1>
        <p className={placeholderStyles.body}>Your bag is empty.</p>
        <Link to="/" className={styles.continueLink}>
          Continue shopping
        </Link>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <Breadcrumbs items={[{ label: 'Cart', href: '/cart' }, { label: 'Checkout' }]} />

      <div className={styles.hero}>
        <h1 className={styles.heading}>Checkout</h1>
        <StepIndicator currentStep={2} />

        <div className={styles.layout}>
          <div className={styles.sections}>
            <section className={styles.section}>
              <SectionHeading number={1} title="Contact Details" />
              <div className={styles.contactGrid}>
                <label className={styles.field}>
                  Full Name
                  <input
                    className={fieldErrors.name ? styles.fieldInputInvalid : undefined}
                    value={contactName}
                    placeholder="Enter your full name"
                    onChange={(e) => {
                      setContactName(e.target.value);
                      if (fieldErrors.name) setFieldErrors((prev) => ({ ...prev, name: undefined }));
                    }}
                    required
                  />
                  {fieldErrors.name && <span className={styles.fieldError}>{fieldErrors.name}</span>}
                </label>
                <label className={styles.field}>
                  Mobile Number
                  <input
                    className={fieldErrors.mobile ? styles.fieldInputInvalid : undefined}
                    value={contactMobile}
                    placeholder="Enter mobile number"
                    onChange={(e) => {
                      setContactMobile(e.target.value);
                      if (fieldErrors.mobile) setFieldErrors((prev) => ({ ...prev, mobile: undefined }));
                    }}
                    required
                  />
                  {fieldErrors.mobile && <span className={styles.fieldError}>{fieldErrors.mobile}</span>}
                </label>
                <label className={styles.field}>
                  Email
                  <input
                    type="email"
                    className={fieldErrors.email ? styles.fieldInputInvalid : undefined}
                    value={contactEmail}
                    placeholder="Enter email address"
                    onChange={(e) => {
                      setContactEmail(e.target.value);
                      if (fieldErrors.email) setFieldErrors((prev) => ({ ...prev, email: undefined }));
                    }}
                    required
                  />
                  {fieldErrors.email && <span className={styles.fieldError}>{fieldErrors.email}</span>}
                </label>
              </div>
            </section>

            <section className={styles.section}>
              <SectionHeading number={2} title="Delivery Address" />

              {isAddingAddress && (
                <AddressForm
                  onSubmit={(input) => createAddressMutation.mutateAsync(input)}
                  onCancel={() => setIsAddingAddress(false)}
                  submitLabel="Use this address"
                />
              )}

              {!isAddingAddress && addresses.length === 0 && (
                <p className={placeholderStyles.body}>No saved addresses — add one to continue.</p>
              )}

              {!isAddingAddress && addresses.length > 0 && (
                <div className={styles.addressList}>
                  {addresses.map((address) => (
                    <AddressCard
                      key={address.id}
                      address={address}
                      selected={address.id === activeAddressId}
                      onSelect={() => {
                        setSelectedAddressId(address.id);
                        if (fieldErrors.address) setFieldErrors((prev) => ({ ...prev, address: undefined }));
                      }}
                    />
                  ))}
                </div>
              )}

              {fieldErrors.address && <p className={styles.fieldError}>{fieldErrors.address}</p>}

              {!isAddingAddress && (
                <button type="button" className={styles.addAddressButton} onClick={() => setIsAddingAddress(true)}>
                  + Add New Address
                </button>
              )}
            </section>

            {checkoutError && <p className={styles.error}>{checkoutError}</p>}

            <div className={styles.placeOrderRow}>
              <button
                type="button"
                className={styles.placeOrderButton}
                disabled={checkoutMutation.isPending}
                onClick={handlePlaceOrder}
              >
                <LockIcon />
                {checkoutMutation.isPending ? 'Placing Order…' : 'Place Order · Continue to Payment'}
              </button>
              <Link to="/cart" className={styles.backToBagLink}>
                ← Back to Bag
              </Link>
            </div>
          </div>

          <OrderSummary
            items={summaryItems}
            itemCount={displayItems.reduce((sum, i) => sum + i.quantity, 0)}
            subtotal={preTaxSubtotal}
            discountAmount={discountAmount}
            gstAmount={gstAmount}
            gstPercent={gstPercent}
            total={total}
            couponInput={couponInput}
            onCouponInputChange={setCouponInput}
            appliedCoupon={appliedCoupon}
            couponError={couponError}
            isApplyingCoupon={applyCouponMutation.isPending}
            onApplyCoupon={() => applyCouponMutation.mutate(subtotalInclGst)}
            onRemoveCoupon={() => {
              setAppliedCoupon(null);
              setCouponInput('');
              setCouponError(null);
            }}
          />
        </div>
      </div>

      <div className={styles.trustCard}>
        <TrustStripBar className={styles.trustStripFlat} />
      </div>
    </div>
  );
}
