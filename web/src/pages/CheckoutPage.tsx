import { useEffect, useState, type ReactNode } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { useCustomer } from '../features/auth/useCustomer';
import { fetchCart } from '../api/cart';
import { fetchAddresses, createAddress, updateAddress, deleteAddress } from '../api/addresses';
import { submitCheckout } from '../api/checkout';
import { simulatePayment } from '../api/payments';
import { launchCashfreeCheckout } from '../features/checkout/cashfree';
import { applyCoupon } from '../api/coupons';
import { AddressForm } from '../features/address/AddressForm';
import { AddressCard } from '../features/address/AddressCard';
import { OrderSummary } from '../features/checkout/OrderSummary';
import { StepIndicator } from '../features/checkout/StepIndicator';
import { TrustStripBar, CART_ASSURANCE_ITEMS } from '../components/TrustStripBar';
import { Breadcrumbs } from '../components/Breadcrumbs';
import type { AddressInput, BuyNowItem, CheckoutResponse } from '../api/types';
import { formatPrice } from '../utils/formatPrice';
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
  isBackordered: boolean;
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

// Mirrors the backend's own constraints (checkout.validators.js: name
// non-empty, mobile 6-20 chars, email must look like an email) — inline
// feedback only; the backend validator is still the final authority (see
// checkoutMutation's onError, which maps its field errors onto this exact
// shape).
function validateContact(name: string, mobile: string, email: string): ContactFieldErrors {
  const errors: ContactFieldErrors = {};
  if (!name.trim()) errors.name = 'Please enter your full name.';
  const digits = mobile.replace(/\D/g, '');
  if (!mobile.trim()) errors.mobile = 'Please enter your mobile number.';
  else if (digits.length < 6) errors.mobile = 'Please enter a valid mobile number.';
  if (!email.trim()) errors.email = 'Please enter your email address.';
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) errors.email = 'Please enter a valid email address.';
  return errors;
}

// Display-only — "+919876543210" -> "+91 98765 43210". Never touches the
// underlying value used for submission/comparison.
function formatMobileDisplay(mobile: string): string {
  const match = mobile.match(/^(\+\d{1,3})(\d{5})(\d{5})$/);
  return match ? `${match[1]} ${match[2]} ${match[3]}` : mobile;
}

function SectionHeading({ number, title, action }: { number: number; title: string; action?: ReactNode }) {
  return (
    <div className={styles.sectionHeadingRow}>
      <span className={styles.sectionNumber}>{number}</span>
      <h2 className={styles.sectionHeading}>{title}</h2>
      {action}
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

function EditIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
    </svg>
  );
}

function UserIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 20c1.2-3.8 4-5.5 7-5.5s5.8 1.7 7 5.5" strokeLinecap="round" />
    </svg>
  );
}

function PhoneIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <path d="M6 3h3l1.5 4-2 1.5a12 12 0 0 0 6 6l1.5-2 4 1.5v3a2 2 0 0 1-2.2 2A17 17 0 0 1 4 6.2 2 2 0 0 1 6 3z" />
    </svg>
  );
}

function MailIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <rect x="3.5" y="5.5" width="17" height="13" rx="2" />
      <path d="M4 6.5l8 6 8-6" />
    </svg>
  );
}

function CheckBadgeIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2l2.4 1.4 2.8-.2 1 2.6 2.4 1.4-.6 2.8.6 2.8-2.4 1.4-1 2.6-2.8-.2L12 18l-2.4 1.4-2.8.2-1-2.6-2.4-1.4.6-2.8-.6-2.8 2.4-1.4 1-2.6 2.8.2L12 2z" />
      <path d="M9 12l2 2 4-4" stroke="#fff" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
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
  const [isChangingAddress, setIsChangingAddress] = useState(false);
  const [editingAddressId, setEditingAddressId] = useState<string | null>(null);

  const [contactName, setContactName] = useState(customer?.fullName ?? '');
  const [contactMobile, setContactMobile] = useState(customer?.mobileNumber ?? '');
  const [contactEmail, setContactEmail] = useState(customer?.email ?? '');
  const [editingContact, setEditingContact] = useState(false);
  const [draftName, setDraftName] = useState('');
  const [draftMobile, setDraftMobile] = useState('');
  const [draftEmail, setDraftEmail] = useState('');

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

  // Start in the compact summary only once we know the saved profile is
  // actually complete — an incomplete profile opens straight into the edit
  // form so there's always something to fill in, not an empty summary.
  useEffect(() => {
    if (!customer) return;
    const complete = Boolean(customer.fullName?.trim() && customer.mobileNumber?.trim() && customer.email?.trim());
    setEditingContact(!complete);
  }, [customer]);

  const [orderResult, setOrderResult] = useState<CheckoutResponse | null>(null);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<ContactFieldErrors>({});
  const [couponInput, setCouponInput] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState<{ code: string; discountAmount: number } | null>(null);
  const [couponError, setCouponError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState('');

  // Mobile sticky payment bar must never sit on top of the footer — hide it
  // once the footer scrolls into view (same pattern as CartPage).
  const [hideStickyBarForFooter, setHideStickyBarForFooter] = useState(false);
  useEffect(() => {
    const footerEl = document.querySelector('footer');
    if (!footerEl) return undefined;
    const observer = new IntersectionObserver(([entry]) => setHideStickyBarForFooter(entry.isIntersecting));
    observer.observe(footerEl);
    return () => observer.disconnect();
  }, []);

  const createAddressMutation = useMutation({
    mutationFn: (input: AddressInput) => createAddress(input),
    onSuccess: ({ address }) => {
      queryClient.invalidateQueries({ queryKey: ['addresses'] });
      setSelectedAddressId(address.id);
      setIsAddingAddress(false);
      setIsChangingAddress(false);
      setFieldErrors((prev) => ({ ...prev, address: undefined }));
      setStatusMessage('New delivery address added and selected.');
    },
  });

  const updateAddressMutation = useMutation({
    mutationFn: ({ id, input }: { id: string; input: Partial<AddressInput> }) => updateAddress(id, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['addresses'] });
      setEditingAddressId(null);
      setStatusMessage('Delivery address updated.');
    },
  });

  const deleteAddressMutation = useMutation({
    mutationFn: (id: string) => deleteAddress(id),
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({ queryKey: ['addresses'] });
      if (selectedAddressId === id) setSelectedAddressId(null);
      setStatusMessage('Delivery address removed.');
    },
  });

  const checkoutMutation = useMutation({
    mutationFn: submitCheckout,
    onSuccess: async (result) => {
      setOrderResult(result);
      const { providerRef, paymentSessionId } = result.payment;
      if (paymentSessionId) {
        // Real gateway (Cashfree) — launch its Drop-in checkout. Whatever
        // happens (paid, failed, or the customer just closes the modal),
        // move on to the confirmation page — it polls the backend for the
        // real, webhook-confirmed status rather than trusting anything the
        // SDK itself reports (see paymentService.confirmPayment).
        try {
          await launchCashfreeCheckout(paymentSessionId);
        } catch (err) {
          console.error('Cashfree checkout failed to launch:', err);
        }
        navigate(`/order-confirmation/${result.order.id}`);
      } else {
        // Stub (dev only) — no real gateway, auto-completes.
        payMutation.mutate({ providerRef, outcome: 'SUCCEEDED' });
      }
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
        if (next.name || next.mobile || next.email) setEditingContact(true);
        setStatusMessage('Please fix the highlighted checkout details.');
        return;
      }
      const message = err instanceof ApiError ? err.message : 'Could not place order.';
      setCheckoutError(message);
      setStatusMessage(message);
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

  const payMutation = useMutation({
    mutationFn: ({ providerRef, outcome }: { providerRef: string; outcome: 'SUCCEEDED' | 'FAILED' }) =>
      simulatePayment(providerRef, outcome),
    onSuccess: (result) => {
      // Cart invalidation now lives on OrderConfirmationPage (fires once
      // the order's polled status actually shows CONFIRMED) — that same
      // logic has to exist there anyway for the real Cashfree flow, which
      // has no synchronous "payment succeeded" response to hook into.
      navigate(`/order-confirmation/${result.order.id}`);
    },
    onError: (err) => {
      setPaymentError(err instanceof ApiError ? err.message : 'Payment could not be processed.');
    },
  });

  const statusRegion = (
    <p role="status" aria-live="polite" className={styles.visuallyHidden}>
      {statusMessage}
    </p>
  );

  if (!isCustomerLoading && !isLoggedIn) {
    return <Navigate to={`/login?redirect=${encodeURIComponent('/checkout')}`} replace />;
  }

  if (isCustomerLoading || isAddressesLoading || (!buyNow && isCartLoading)) {
    return (
      <div className={styles.page} aria-busy="true">
        {statusRegion}
        <Breadcrumbs items={[{ label: 'Cart', href: '/cart' }, { label: 'Checkout' }]} />
        <h1 className={styles.heading}>Checkout</h1>
        <StepIndicator currentStep={2} />
        <div className={styles.layout}>
          <div className={styles.mainColumnTop}>
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
          <div className={styles.summaryColumn}>
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
          isBackordered: buyNow.isBackordered ?? false,
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
        isBackordered: i.isBackordered,
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
  const activeAddress = addresses.find((a) => a.id === activeAddressId) ?? null;
  const editingAddress = addresses.find((a) => a.id === editingAddressId) ?? null;

  const summaryItems = displayItems.map((item) => {
    const variantBits = [item.sizeLabel ? `Size ${item.sizeLabel}` : null, item.diamondConfigName].filter(Boolean);
    return {
      id: [item.productId, item.sizeId, item.goldColor, item.purity, item.diamondConfigId].map((v) => v ?? '').join(':'),
      name: variantBits.length > 0 ? `${item.name} (${variantBits.join(', ')})` : item.name,
      qty: item.quantity,
      image: item.primaryImageUrl,
      price: item.sellingPrice,
      isBackordered: item.isBackordered,
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

  function startEditContact() {
    setDraftName(contactName);
    setDraftMobile(contactMobile);
    setDraftEmail(contactEmail);
    setFieldErrors((prev) => ({ ...prev, name: undefined, mobile: undefined, email: undefined }));
    setEditingContact(true);
  }

  function saveContact() {
    const errors = validateContact(draftName, draftMobile, draftEmail);
    setFieldErrors((prev) => ({ ...prev, ...errors }));
    if (errors.name || errors.mobile || errors.email) return;
    setContactName(draftName.trim());
    setContactMobile(draftMobile.trim());
    setContactEmail(draftEmail.trim());
    setEditingContact(false);
    setStatusMessage('Contact details saved.');
  }

  function handlePlaceOrder() {
    setCheckoutError(null);
    const nextFieldErrors = validateContact(contactName, contactMobile, contactEmail);
    if (!activeAddressId) {
      nextFieldErrors.address = 'Please select or add a delivery address.';
    }
    setFieldErrors(nextFieldErrors);
    if (nextFieldErrors.name || nextFieldErrors.mobile || nextFieldErrors.email) {
      setEditingContact(true);
      setStatusMessage('Please complete your contact details before continuing.');
      return;
    }
    if (nextFieldErrors.address) {
      setStatusMessage(nextFieldErrors.address);
      return;
    }
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

  const isPlacingOrder = checkoutMutation.isPending || payMutation.isPending;

  return (
    <div className={styles.page}>
      {statusRegion}
      <Breadcrumbs items={[{ label: 'Cart', href: '/cart' }, { label: 'Checkout' }]} />

      <h1 className={styles.heading}>Checkout</h1>
      <StepIndicator currentStep={2} />

      <div className={styles.layout}>
        <div className={styles.mainColumnTop}>
          <section className={styles.section}>
            <SectionHeading
              number={1}
              title="Contact Details"
              action={
                !editingContact && (
                  <button type="button" className={styles.editAction} onClick={startEditContact}>
                    Edit
                    <EditIcon />
                  </button>
                )
              }
            />

            {!editingContact ? (
              <div className={styles.contactSummary}>
                <p className={styles.contactRow}>
                  <UserIcon />
                  {contactName}
                </p>
                <p className={styles.contactRow}>
                  <PhoneIcon />
                  {formatMobileDisplay(contactMobile)}
                  {customer?.mobileNumber === contactMobile && (
                    <span className={styles.verifiedBadge}>
                      <CheckBadgeIcon />
                      Verified
                    </span>
                  )}
                </p>
                <p className={styles.contactRow}>
                  <MailIcon />
                  {contactEmail}
                </p>
              </div>
            ) : (
              <div className={styles.contactGrid}>
                <label className={styles.field}>
                  Full Name
                  <input
                    className={fieldErrors.name ? styles.fieldInputInvalid : undefined}
                    value={draftName}
                    placeholder="Enter your full name"
                    onChange={(e) => {
                      setDraftName(e.target.value);
                      if (fieldErrors.name) setFieldErrors((prev) => ({ ...prev, name: undefined }));
                    }}
                    required
                  />
                  {fieldErrors.name && (
                    <span className={styles.fieldError} role="alert">
                      {fieldErrors.name}
                    </span>
                  )}
                </label>
                <label className={styles.field}>
                  Mobile Number
                  <input
                    className={fieldErrors.mobile ? styles.fieldInputInvalid : undefined}
                    value={draftMobile}
                    placeholder="Enter mobile number"
                    onChange={(e) => {
                      setDraftMobile(e.target.value);
                      if (fieldErrors.mobile) setFieldErrors((prev) => ({ ...prev, mobile: undefined }));
                    }}
                    required
                  />
                  {fieldErrors.mobile && (
                    <span className={styles.fieldError} role="alert">
                      {fieldErrors.mobile}
                    </span>
                  )}
                </label>
                <label className={styles.field}>
                  Email Address
                  <input
                    type="email"
                    className={fieldErrors.email ? styles.fieldInputInvalid : undefined}
                    value={draftEmail}
                    placeholder="Enter email address"
                    onChange={(e) => {
                      setDraftEmail(e.target.value);
                      if (fieldErrors.email) setFieldErrors((prev) => ({ ...prev, email: undefined }));
                    }}
                    required
                  />
                  {fieldErrors.email && (
                    <span className={styles.fieldError} role="alert">
                      {fieldErrors.email}
                    </span>
                  )}
                </label>
                <div className={styles.contactEditActions}>
                  <button type="button" className={styles.saveContactButton} onClick={saveContact}>
                    Save Changes
                  </button>
                  {Boolean(contactName && contactMobile && contactEmail) && (
                    <button type="button" className={styles.cancelContactButton} onClick={() => setEditingContact(false)}>
                      Cancel
                    </button>
                  )}
                </div>
              </div>
            )}
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

            {editingAddressId && editingAddress && (
              <AddressForm
                initial={editingAddress}
                onSubmit={(input) => updateAddressMutation.mutateAsync({ id: editingAddress.id, input })}
                onCancel={() => setEditingAddressId(null)}
                submitLabel="Save Address"
              />
            )}

            {!isAddingAddress && !editingAddressId && (
              <>
                {addresses.length === 0 && (
                  <p className={placeholderStyles.body}>No saved addresses — add one to continue.</p>
                )}

                {addresses.length > 0 && !isChangingAddress && activeAddress && (
                  <AddressCard
                    address={activeAddress}
                    selected
                    onEdit={() => setEditingAddressId(activeAddress.id)}
                    onChange={addresses.length > 1 ? () => setIsChangingAddress(true) : undefined}
                  />
                )}

                {addresses.length > 0 && isChangingAddress && (
                  <div className={styles.addressChangePanel}>
                    <div className={styles.addressList}>
                      {addresses.map((address) => (
                        <AddressCard
                          key={address.id}
                          address={address}
                          selected={address.id === activeAddressId}
                          onSelect={() => {
                            setSelectedAddressId(address.id);
                            setIsChangingAddress(false);
                            setFieldErrors((prev) => ({ ...prev, address: undefined }));
                            setStatusMessage('Delivery address selected.');
                          }}
                          onEdit={() => setEditingAddressId(address.id)}
                          onDelete={() => deleteAddressMutation.mutate(address.id)}
                        />
                      ))}
                    </div>
                    <button
                      type="button"
                      className={styles.cancelChangeLink}
                      onClick={() => setIsChangingAddress(false)}
                    >
                      Cancel
                    </button>
                  </div>
                )}

                {fieldErrors.address && (
                  <p className={styles.fieldError} role="alert">
                    {fieldErrors.address}
                  </p>
                )}

                {!isChangingAddress && (
                  <button type="button" className={styles.addAddressButton} onClick={() => setIsAddingAddress(true)}>
                    + Add New Address
                  </button>
                )}
              </>
            )}
          </section>

          {checkoutError && (
            <p className={styles.error} role="alert">
              {checkoutError}
            </p>
          )}
        </div>

        <div className={styles.summaryColumn}>
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
              setStatusMessage('Coupon removed.');
            }}
            showTrustList={false}
            hidePrimaryOnMobile
            primaryAction={{
              label: isPlacingOrder ? 'Placing Order…' : 'Continue to Payment',
              icon: <LockIcon />,
              onClick: handlePlaceOrder,
              disabled: isPlacingOrder,
            }}
          />
        </div>

        <div className={styles.mainColumnBottom}>
          <TrustStripBar variant="boxed" items={CART_ASSURANCE_ITEMS} />
          <div className={styles.backToBagRow}>
            <Link to="/cart" className={styles.backToBagLink}>
              ← Back to Bag
            </Link>
          </div>
        </div>
      </div>

      <div className={`${styles.stickyBar} ${hideStickyBarForFooter ? styles.stickyBarHidden : ''}`}>
        <div className={styles.stickyBarTotal}>
          <p className={styles.stickyBarLabel}>Total</p>
          <p className={styles.stickyBarValue}>{formatPrice(total)}</p>
        </div>
        <button type="button" className={styles.stickyBarButton} disabled={isPlacingOrder} onClick={handlePlaceOrder}>
          <LockIcon />
          {isPlacingOrder ? 'Placing…' : 'Continue to Payment'}
        </button>
      </div>
    </div>
  );
}
