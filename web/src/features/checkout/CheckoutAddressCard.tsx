import type { Address, AddressType } from '../../api/types';
import styles from './CheckoutAddressCard.module.css';

export interface AddressDraft {
  type: AddressType;
  name: string;
  mobileNumber: string;
  addressLine: string;
  landmark: string;
  city: string;
  state: string;
  pincode: string;
}

export type AddressFieldErrors = Partial<
  Record<'name' | 'mobileNumber' | 'email' | 'addressLine' | 'city' | 'state' | 'pincode', string>
>;

interface CheckoutAddressCardProps {
  addresses: Address[];
  selectedAddressId: string | null;
  onSelectAddress: (_id: string) => void;
  onStartNewAddress: () => void;
  onDeleteAddress: (_id: string) => void;
  draft: AddressDraft;
  onDraftChange: (_patch: Partial<AddressDraft>) => void;
  email: string;
  onEmailChange: (_value: string) => void;
  deliveryNote: string;
  onDeliveryNoteChange: (_value: string) => void;
  fieldErrors: AddressFieldErrors;
}

const TYPES: AddressType[] = ['HOME', 'OFFICE', 'OTHER'];
const TYPE_LABEL: Record<AddressType, string> = { HOME: 'Home', OFFICE: 'Office', OTHER: 'Other' };

function PinIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      <path d="M12 21s7-6.3 7-11.5A7 7 0 0 0 5 9.5C5 14.7 12 21 12 21z" />
      <circle cx="12" cy="9.5" r="2.5" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
      <path d="M5 5l14 14M19 5L5 19" />
    </svg>
  );
}

// Merged "Address" card (approved reference layout) — replaces the old
// separate Contact Details + Delivery Address sections. A saved address is
// picked via the pill row (one pill per address, labelled by its type) or a
// brand-new one is started via "+"; the field grid below is always a live,
// editable draft of whichever is currently selected. Nothing here writes to
// the backend directly — CheckoutPage owns the create/update mutation and
// resolves the final addressId once, at "Proceed to Payment" time, so
// there's no separate "Save Address" step the reference doesn't show.
export function CheckoutAddressCard({
  addresses,
  selectedAddressId,
  onSelectAddress,
  onStartNewAddress,
  onDeleteAddress,
  draft,
  onDraftChange,
  email,
  onEmailChange,
  deliveryNote,
  onDeliveryNoteChange,
  fieldErrors,
}: CheckoutAddressCardProps) {
  return (
    <section className={styles.card}>
      <div className={styles.headerRow}>
        <h2 className={styles.title}>
          <PinIcon />
          Address
        </h2>

        {addresses.length > 0 && (
          <div className={styles.savedPills}>
            {addresses.map((address) => (
              <span key={address.id} className={styles.savedPillWrap}>
                <button
                  type="button"
                  className={`${styles.savedPill} ${address.id === selectedAddressId ? styles.savedPillActive : ''}`}
                  onClick={() => onSelectAddress(address.id)}
                >
                  {TYPE_LABEL[address.type]}
                </button>
                {addresses.length > 1 && address.id !== selectedAddressId && (
                  <button
                    type="button"
                    className={styles.savedPillDelete}
                    aria-label={`Delete ${TYPE_LABEL[address.type]} address`}
                    onClick={() => onDeleteAddress(address.id)}
                  >
                    <CloseIcon />
                  </button>
                )}
              </span>
            ))}
            <button type="button" className={styles.addPill} aria-label="Add a new address" onClick={onStartNewAddress}>
              <PlusIcon />
            </button>
          </div>
        )}
      </div>

      <div className={styles.typeRow} role="group" aria-label="Address type">
        {TYPES.map((t) => (
          <button
            key={t}
            type="button"
            className={`${styles.typeTag} ${draft.type === t ? styles.typeTagActive : ''}`}
            onClick={() => onDraftChange({ type: t })}
          >
            {TYPE_LABEL[t]}
          </button>
        ))}
      </div>

      <div className={styles.grid}>
        <label className={`${styles.field} ${styles.spanHalf}`}>
          Name
          <input
            className={fieldErrors.name ? styles.invalid : undefined}
            value={draft.name}
            placeholder="Full name"
            onChange={(e) => onDraftChange({ name: e.target.value })}
          />
          {fieldErrors.name && <span className={styles.fieldErrorText}>{fieldErrors.name}</span>}
        </label>
        <label className={`${styles.field} ${styles.spanHalf}`}>
          Mobile No.
          <input
            className={fieldErrors.mobileNumber ? styles.invalid : undefined}
            value={draft.mobileNumber}
            placeholder="Mobile number"
            onChange={(e) => onDraftChange({ mobileNumber: e.target.value })}
          />
          {fieldErrors.mobileNumber && <span className={styles.fieldErrorText}>{fieldErrors.mobileNumber}</span>}
        </label>

        <label className={`${styles.field} ${styles.spanHalf}`}>
          Email
          <input
            type="email"
            className={fieldErrors.email ? styles.invalid : undefined}
            value={email}
            placeholder="Email address"
            onChange={(e) => onEmailChange(e.target.value)}
          />
          {fieldErrors.email && <span className={styles.fieldErrorText}>{fieldErrors.email}</span>}
        </label>
        <label className={`${styles.field} ${styles.spanHalf}`}>
          City
          <input
            className={fieldErrors.city ? styles.invalid : undefined}
            value={draft.city}
            placeholder="City"
            onChange={(e) => onDraftChange({ city: e.target.value })}
          />
          {fieldErrors.city && <span className={styles.fieldErrorText}>{fieldErrors.city}</span>}
        </label>

        <label className={`${styles.field} ${styles.spanThird}`}>
          State
          <input
            className={fieldErrors.state ? styles.invalid : undefined}
            value={draft.state}
            placeholder="State"
            onChange={(e) => onDraftChange({ state: e.target.value })}
          />
          {fieldErrors.state && <span className={styles.fieldErrorText}>{fieldErrors.state}</span>}
        </label>
        <label className={`${styles.field} ${styles.spanThird}`}>
          Pin code
          <input
            className={fieldErrors.pincode ? styles.invalid : undefined}
            value={draft.pincode}
            placeholder="Pin code"
            onChange={(e) => onDraftChange({ pincode: e.target.value })}
          />
          {fieldErrors.pincode && <span className={styles.fieldErrorText}>{fieldErrors.pincode}</span>}
        </label>
        <label className={`${styles.field} ${styles.spanThird}`}>
          Landmark (optional)
          <input value={draft.landmark} placeholder="Nearby landmark" onChange={(e) => onDraftChange({ landmark: e.target.value })} />
        </label>

        <label className={`${styles.field} ${styles.spanFull}`}>
          Address
          <textarea
            className={fieldErrors.addressLine ? styles.invalid : undefined}
            value={draft.addressLine}
            placeholder="House / flat no., building, street"
            rows={2}
            onChange={(e) => onDraftChange({ addressLine: e.target.value })}
          />
          {fieldErrors.addressLine && <span className={styles.fieldErrorText}>{fieldErrors.addressLine}</span>}
        </label>

        <label className={`${styles.field} ${styles.spanFull}`}>
          Note for delivery (optional)
          <textarea
            value={deliveryNote}
            placeholder="E.g. Please call before delivery"
            rows={2}
            onChange={(e) => onDeliveryNoteChange(e.target.value)}
          />
        </label>
      </div>
    </section>
  );
}
