import { useState, type FormEvent } from 'react';
import type { Address, AddressInput, AddressType } from '../../api/types';
import { ApiError } from '../../api/client';
import styles from './AddressForm.module.css';

interface AddressFormProps {
  initial?: Address;
  onSubmit: (input: AddressInput) => Promise<unknown>;
  onCancel?: () => void;
  submitLabel?: string;
  // Drops the form's own boxed border/background/padding — used when a
  // caller (CheckoutPage's AddressFormModal) already provides that framing
  // via its own dialog surface, so the form doesn't render as a box-in-a-box.
  bare?: boolean;
}

const TYPES: AddressType[] = ['HOME', 'OFFICE', 'OTHER'];

export function AddressForm({ initial, onSubmit, onCancel, submitLabel = 'Save Address', bare = false }: AddressFormProps) {
  const [type, setType] = useState<AddressType>(initial?.type ?? 'HOME');
  const [name, setName] = useState(initial?.name ?? '');
  const [mobileNumber, setMobileNumber] = useState(initial?.mobileNumber ?? '');
  const [addressLine, setAddressLine] = useState(initial?.addressLine ?? '');
  const [building, setBuilding] = useState(initial?.building ?? '');
  const [landmark, setLandmark] = useState(initial?.landmark ?? '');
  const [city, setCity] = useState(initial?.city ?? '');
  const [state, setState] = useState(initial?.state ?? '');
  const [pincode, setPincode] = useState(initial?.pincode ?? '');
  const [isDefault, setIsDefault] = useState(initial?.isDefault ?? false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      await onSubmit({
        type,
        name,
        mobileNumber,
        addressLine,
        building: building || null,
        landmark: landmark || null,
        city,
        state,
        pincode,
        country: 'India',
        isDefault,
      });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save address.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className={`${styles.form} ${bare ? styles.formBare : ''}`} onSubmit={handleSubmit}>
      <div className={styles.typeRow}>
        {TYPES.map((t) => (
          <button
            key={t}
            type="button"
            className={`${styles.typePill} ${type === t ? styles.typePillActive : ''}`}
            onClick={() => setType(t)}
          >
            {t.charAt(0) + t.slice(1).toLowerCase()}
          </button>
        ))}
      </div>

      <div className={styles.grid}>
        <label className={styles.field}>
          Full Name
          <input value={name} onChange={(e) => setName(e.target.value)} required />
        </label>
        <label className={styles.field}>
          Mobile Number
          <input value={mobileNumber} onChange={(e) => setMobileNumber(e.target.value)} required />
        </label>
      </div>

      <div className={styles.grid}>
        <label className={styles.field}>
          House / Flat / Building (optional)
          <input value={building} onChange={(e) => setBuilding(e.target.value)} />
        </label>
        <label className={styles.field}>
          Street / Area
          <input value={addressLine} onChange={(e) => setAddressLine(e.target.value)} required />
        </label>
      </div>

      <label className={styles.field}>
        Landmark (optional)
        <input value={landmark} onChange={(e) => setLandmark(e.target.value)} />
      </label>

      <div className={styles.grid3}>
        <label className={styles.field}>
          PIN Code
          <input value={pincode} onChange={(e) => setPincode(e.target.value)} required />
        </label>
        <label className={styles.field}>
          City
          <input value={city} onChange={(e) => setCity(e.target.value)} required />
        </label>
        <label className={styles.field}>
          State
          <input value={state} onChange={(e) => setState(e.target.value)} required />
        </label>
      </div>

      <label className={styles.defaultCheckboxRow}>
        <input type="checkbox" checked={isDefault} onChange={(e) => setIsDefault(e.target.checked)} />
        Make this my default address
      </label>

      {error && <p className={styles.error}>{error}</p>}

      <div className={styles.actions}>
        <button type="submit" className={styles.submit} disabled={isSubmitting}>
          {isSubmitting ? 'Saving…' : submitLabel}
        </button>
        {onCancel && (
          <button type="button" className={styles.cancel} onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
