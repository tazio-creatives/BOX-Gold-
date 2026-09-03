import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { useCustomer } from '../features/auth/useCustomer';
import { SignInRequired } from '../features/auth/SignInRequired';
import { fetchCart } from '../api/cart';
import { fetchAddresses, createAddress, updateAddress, deleteAddress } from '../api/addresses';
import { submitCheckout } from '../api/checkout';
import { simulatePayment } from '../api/payments';
import { launchCashfreeCheckout } from '../features/checkout/cashfree';
import { applyCoupon } from '../api/coupons';
import { CheckoutAddressCard, type AddressDraft, type AddressFieldErrors } from '../features/checkout/CheckoutAddressCard';
import { CheckoutOrderSummary } from '../features/checkout/CheckoutOrderSummary';
import { StepIndicator } from '../features/checkout/StepIndicator';
import { TrustStripBar, CART_ASSURANCE_ITEMS } from '../components/TrustStripBar';
import { Breadcrumbs } from '../components/Breadcrumbs';
import type { Address, AddressInput, BuyNowItem, CheckoutResponse } from '../api/types';
import { formatPrice } from '../utils/formatPrice';
import { effectiveMrp } from '../utils/effectiveMrp';
import { useDocumentTitle } from '../utils/useDocumentTitle';
import { ApiError } from '../api/client';
import styles from './CheckoutPage.module.css';
import placeholderStyles from './PlaceholderPage.module.css';

interface DisplayItem {
  productId: string;
  variantId: string | null;
  name: string;
  sellingPrice: number;
  mrp: number;
  sellingPriceOriginal: number;
  quantity: number;
  primaryImageUrl: string | null;
  sizeLabel: string | null;
  goldColor: string | null;
  purity: string | null;
  diamondConfigName: string | null;
  isBackordered: boolean;
}

// Backend field paths (checkout.validators.js) mapped to plain-language
// messages — the raw Zod messages ("String must contain at least...") aren't
// something a shopper should have to parse.
const FIELD_ERROR_MESSAGES: Record<string, string> = {
  'contact.name': 'Please enter the recipient name.',
  'contact.mobile': 'Please enter a valid mobile number.',
  'contact.email': 'Please enter a valid email address.',
  addressId: 'Please complete your delivery address.',
};

function emptyDraft(customer: { fullName: string | null; mobileNumber: string } | null): AddressDraft {
  return {
    type: 'HOME',
    name: customer?.fullName ?? '',
    mobileNumber: customer?.mobileNumber ?? '',
    addressLine: '',
    landmark: '',
    city: '',
    state: '',
    pincode: '',
  };
}

function addressToDraft(address: Address): AddressDraft {
  return {
    type: address.type,
    name: address.name,
    mobileNumber: address.mobileNumber,
    addressLine: address.addressLine,
    landmark: address.landmark ?? '',
    city: address.city,
    state: address.state,
    pincode: address.pincode,
  };
}

// Whether the draft still matches the saved address it was loaded from — if
// so, "Proceed to Payment" can reuse the existing addressId directly instead
// of issuing a redundant update call.
function draftMatchesAddress(address: Address, draft: AddressDraft): boolean {
  return (
    address.type === draft.type &&
    address.name === draft.name.trim() &&
    address.mobileNumber === draft.mobileNumber.trim() &&
    address.addressLine === draft.addressLine.trim() &&
    (address.landmark ?? '') === draft.landmark.trim() &&
    address.city === draft.city.trim() &&
    address.state === draft.state.trim() &&
    address.pincode === draft.pincode.trim()
  );
}

// Address-only fields — used both by the standalone "Save Address" action
// (which has nothing to do with the checkout contact email) and as the base
// for the full checkout validation below.
function validateAddressFields(draft: AddressDraft): AddressFieldErrors {
  const errors: AddressFieldErrors = {};
  if (!draft.name.trim()) errors.name = 'Please enter the recipient name.';
  const digits = draft.mobileNumber.replace(/\D/g, '');
  if (!draft.mobileNumber.trim()) errors.mobileNumber = 'Please enter a mobile number.';
  else if (digits.length < 6) errors.mobileNumber = 'Please enter a valid mobile number.';
  if (!draft.addressLine.trim()) errors.addressLine = 'Please enter your address.';
  if (!draft.city.trim()) errors.city = 'Please enter your city.';
  if (!draft.state.trim()) errors.state = 'Please enter your state.';
  if (!draft.pincode.trim()) errors.pincode = 'Please enter your pincode.';
  return errors;
}

// Mirrors the backend's own constraints (checkout.validators.js) — inline
// feedback only; the backend validator is still the final authority (see
// checkoutMutation's onError, which maps its field errors onto this exact
// shape).
function validateCheckoutFields(draft: AddressDraft, email: string): AddressFieldErrors {
  const errors = validateAddressFields(draft);
  if (!email.trim()) errors.email = 'Please enter your email address.';
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) errors.email = 'Please enter a valid email address.';
  return errors;
}

function ChevronLeftIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M15 18l-6-6 6-6" />
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
  const [draft, setDraft] = useState<AddressDraft>(() => emptyDraft(null));
  // Whether the Address card shows the live-editable grid vs. the read-only
  // saved-address summary. Lifted up here (rather than local state inside
  // CheckoutAddressCard) so a successful save (handleSaveAddress below) can
  // flip it back to the summary itself — an update doesn't change
  // selectedAddressId, so there'd be nothing else to key that transition off.
  const [isEditingAddress, setIsEditingAddress] = useState(true);
  const [contactEmail, setContactEmail] = useState(customer?.email ?? '');
  const [deliveryNote, setDeliveryNote] = useState('');

  const addresses = addressesData?.addresses ?? [];

  // Seed the draft from the customer's default (or most recent) saved
  // address the first time addresses load — a one-time seed tracked by this
  // ref, not by `selectedAddressId` being null. `selectedAddressId` also
  // goes back to null when the shopper deliberately clicks "Add a new
  // address" (startNewAddress below) — keying this effect off that same
  // value used to make it re-fire and silently re-select the saved address,
  // undoing "start new" the instant it was clicked.
  const hasSeededAddressRef = useRef(false);
  useEffect(() => {
    if (addresses.length === 0 || hasSeededAddressRef.current) return;
    hasSeededAddressRef.current = true;
    const initial = addresses.find((a) => a.isDefault) ?? addresses[0];
    setSelectedAddressId(initial.id);
    setDraft(addressToDraft(initial));
    setIsEditingAddress(false);
    // addressesData (not the `addresses` fallback-to-[] derivation, which is
    // a fresh array every render) — react-query only gives a new reference
    // on real data changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addressesData]);

  // First-time customer with no saved address yet — pre-fill name/mobile
  // from their profile so there's less to type.
  useEffect(() => {
    if (!customer || addresses.length > 0 || selectedAddressId) return;
    setDraft((d) => ({ ...d, name: d.name || customer.fullName || '', mobileNumber: d.mobileNumber || customer.mobileNumber || '' }));
  }, [customer, addresses.length, selectedAddressId]);

  useEffect(() => {
    if (!customer) return;
    setContactEmail((prev) => prev || customer.email || '');
  }, [customer]);

  const [orderResult, setOrderResult] = useState<CheckoutResponse | null>(null);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<AddressFieldErrors>({});
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
      setStatusMessage('New delivery address added.');
    },
  });

  const updateAddressMutation = useMutation({
    mutationFn: ({ id, input }: { id: string; input: Partial<AddressInput> }) => updateAddress(id, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['addresses'] });
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
        const next: AddressFieldErrors = {};
        let unmapped = false;
        for (const field of err.fields) {
          const message = FIELD_ERROR_MESSAGES[field.path];
          if (message) {
            if (field.path === 'contact.name') next.name = message;
            else if (field.path === 'contact.mobile') next.mobileNumber = message;
            else if (field.path === 'contact.email') next.email = message;
          } else {
            unmapped = true;
          }
        }
        setFieldErrors(next);
        setCheckoutError(unmapped ? err.message : null);
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

  const headingRow = (
    <div className={styles.headingRow}>
      <Link to="/cart" className={styles.backChevron} aria-label="Back to Bag">
        <ChevronLeftIcon />
      </Link>
      <h1 className={styles.heading}>Checkout</h1>
    </div>
  );

  if (!isCustomerLoading && !isLoggedIn) {
    return (
      <div className={styles.page}>
        {statusRegion}
        <Breadcrumbs items={[{ label: 'Cart', href: '/cart' }, { label: 'Checkout' }]} />
        <SignInRequired message="Sign in to continue to checkout." />
      </div>
    );
  }

  if (isCustomerLoading || isAddressesLoading || (!buyNow && isCartLoading)) {
    return (
      <div className={styles.page} aria-busy="true">
        {statusRegion}
        <Breadcrumbs items={[{ label: 'Cart', href: '/cart' }, { label: 'Checkout' }]} />
        {headingRow}
        <StepIndicator currentStep={2} />
        <div className={styles.layout}>
          <div className={styles.mainColumnTop}>
            <div className={styles.skeletonAddressCard} />
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
          variantId: buyNow.variantId ?? null,
          name: buyNow.name,
          sellingPrice: buyNow.sellingPrice,
          mrp: buyNow.sellingPrice,
          sellingPriceOriginal: buyNow.sellingPrice,
          quantity: buyNow.quantity,
          primaryImageUrl: buyNow.primaryImageUrl,
          sizeLabel: buyNow.sizeLabel ?? null,
          goldColor: buyNow.goldColor ?? null,
          purity: buyNow.purity ?? null,
          diamondConfigName: buyNow.diamondConfigName ?? null,
          isBackordered: buyNow.isBackordered ?? false,
        },
      ]
    : (cartData?.items ?? []).map((i) => ({
        productId: i.productId,
        variantId: i.variantId,
        name: i.name,
        sellingPrice: i.sellingPrice,
        mrp: i.mrp,
        sellingPriceOriginal: i.sellingPriceOriginal,
        quantity: i.quantity,
        primaryImageUrl: i.primaryImageUrl,
        sizeLabel: i.sizeLabel,
        goldColor: i.goldColor,
        purity: i.purity,
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

  // Sum of every line's (strike-through MRP - selling price) — mirrors
  // CartPage's identical calculation. Buy Now items carry no mrp/
  // sellingPriceOriginal of their own (see DisplayItem mapping above, which
  // seeds both from sellingPrice), so effectiveMrp naturally yields 0 there
  // and the savings banner just doesn't show for that flow.
  const savingsAmount = displayItems.reduce((sum, item) => {
    const { strikePrice } = effectiveMrp(item.sellingPrice, item.mrp, item.sellingPriceOriginal);
    return sum + Math.max(strikePrice - item.sellingPrice, 0) * item.quantity;
  }, 0);

  const selectedAddress = addresses.find((a) => a.id === selectedAddressId) ?? null;

  const summaryItems = displayItems.map((item) => {
    const variantBits = [item.sizeLabel ? `Size ${item.sizeLabel}` : null, item.diamondConfigName].filter(Boolean);
    return {
      id: item.variantId ?? item.productId,
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

  function selectAddress(id: string) {
    const address = addresses.find((a) => a.id === id);
    if (!address) return;
    setSelectedAddressId(id);
    setDraft(addressToDraft(address));
    setFieldErrors({});
    setIsEditingAddress(false);
  }

  function startNewAddress() {
    setSelectedAddressId(null);
    setDraft(emptyDraft(customer));
    setFieldErrors({});
    setIsEditingAddress(true);
  }

  // Cancel out of editing an existing saved address without persisting
  // anything — reverts the draft back to that address's true saved values
  // (discarding whatever was typed) rather than leaving stale unsaved text
  // sitting behind the summary view.
  function cancelEditAddress() {
    if (selectedAddress) {
      setDraft(addressToDraft(selectedAddress));
    } else if (addresses.length > 0) {
      // Cancelling out of "Add a new address" with no address of its own to
      // revert to — fall back to an existing saved one instead of leaving
      // the (now unreachable-via-summary) edit form as the only option.
      const fallback = addresses.find((a) => a.isDefault) ?? addresses[0];
      setSelectedAddressId(fallback.id);
      setDraft(addressToDraft(fallback));
    }
    setFieldErrors({});
    setIsEditingAddress(false);
  }

  // Shared by "Save Address" and "Proceed to Payment" — creates a new
  // address, or updates the selected one only if the draft actually diverged
  // from it (draftMatchesAddress), or does nothing if nothing changed.
  // Returns the addressId to check out with, or null if there's still
  // nothing to check out with (validation caller's job to have already
  // caught that).
  async function upsertAddressDraft(): Promise<string> {
    if (!selectedAddress) {
      const { address } = await createAddressMutation.mutateAsync({
        type: draft.type,
        name: draft.name.trim(),
        mobileNumber: draft.mobileNumber.trim(),
        addressLine: draft.addressLine.trim(),
        building: null,
        landmark: draft.landmark.trim() || null,
        city: draft.city.trim(),
        state: draft.state.trim(),
        pincode: draft.pincode.trim(),
        country: 'India',
        isDefault: addresses.length === 0,
      });
      return address.id;
    }
    if (!draftMatchesAddress(selectedAddress, draft)) {
      await updateAddressMutation.mutateAsync({
        id: selectedAddress.id,
        input: {
          type: draft.type,
          name: draft.name.trim(),
          mobileNumber: draft.mobileNumber.trim(),
          addressLine: draft.addressLine.trim(),
          landmark: draft.landmark.trim() || null,
          city: draft.city.trim(),
          state: draft.state.trim(),
          pincode: draft.pincode.trim(),
        },
      });
    }
    return selectedAddress.id;
  }

  async function handleSaveAddress() {
    setCheckoutError(null);
    const errors = validateAddressFields(draft);
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
      setStatusMessage('Please complete the address details.');
      return;
    }
    try {
      await upsertAddressDraft();
      setIsEditingAddress(false);
    } catch (err) {
      setCheckoutError(err instanceof ApiError ? err.message : 'Could not save your delivery address.');
    }
  }

  async function handlePlaceOrder() {
    setCheckoutError(null);
    const errors = validateCheckoutFields(draft, contactEmail);
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
      setStatusMessage('Please complete your address details before continuing.');
      return;
    }
    if (displayItems.length === 0) {
      setCheckoutError('There is nothing to check out.');
      return;
    }

    let addressId: string;
    try {
      addressId = await upsertAddressDraft();
    } catch (err) {
      setCheckoutError(err instanceof ApiError ? err.message : 'Could not save your delivery address.');
      return;
    }

    checkoutMutation.mutate({
      contact: { name: draft.name.trim(), mobile: draft.mobileNumber.trim(), email: contactEmail.trim() },
      addressId,
      items: displayItems.map((i) => ({
        productId: i.productId,
        quantity: i.quantity,
        ...(i.variantId ? { variantId: i.variantId } : {}),
      })),
      ...(appliedCoupon ? { couponCode: appliedCoupon.code } : {}),
      ...(deliveryNote.trim() ? { deliveryNote: deliveryNote.trim() } : {}),
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

  const isPlacingOrder =
    checkoutMutation.isPending || payMutation.isPending || createAddressMutation.isPending || updateAddressMutation.isPending;

  return (
    <div className={styles.page}>
      {statusRegion}
      <Breadcrumbs items={[{ label: 'Cart', href: '/cart' }, { label: 'Checkout' }]} />

      {headingRow}
      <StepIndicator currentStep={2} />

      <div className={styles.layout}>
        <div className={styles.mainColumnTop}>
          <CheckoutAddressCard
            addresses={addresses}
            selectedAddressId={selectedAddressId}
            selectedAddress={selectedAddress}
            onSelectAddress={selectAddress}
            onStartNewAddress={startNewAddress}
            onDeleteAddress={(id) => deleteAddressMutation.mutate(id)}
            draft={draft}
            onDraftChange={(patch) => setDraft((d) => ({ ...d, ...patch }))}
            email={contactEmail}
            onEmailChange={setContactEmail}
            deliveryNote={deliveryNote}
            onDeliveryNoteChange={setDeliveryNote}
            fieldErrors={fieldErrors}
            isEditing={isEditingAddress}
            onStartEditing={() => setIsEditingAddress(true)}
            onCancelEdit={cancelEditAddress}
            onSaveAddress={handleSaveAddress}
            isSavingAddress={createAddressMutation.isPending || updateAddressMutation.isPending}
          />

          {checkoutError && (
            <p className={styles.error} role="alert">
              {checkoutError}
            </p>
          )}
        </div>

        <div className={styles.summaryColumn}>
          <CheckoutOrderSummary
            items={summaryItems}
            itemCount={displayItems.reduce((sum, i) => sum + i.quantity, 0)}
            subtotal={preTaxSubtotal}
            savingsAmount={savingsAmount}
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
            onPlaceOrder={handlePlaceOrder}
            isPlacingOrder={isPlacingOrder}
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
          {isPlacingOrder ? 'Placing…' : 'Proceed to Payment'}
        </button>
      </div>
    </div>
  );
}
