import { useState, type FormEvent } from 'react';
import styles from './DeliveryChecker.module.css';

// India Post PIN codes are 6 digits and never start with 0.
const PINCODE_PATTERN = /^[1-9][0-9]{5}$/;

type Status = 'idle' | 'invalid' | 'valid';

export function DeliveryChecker() {
  const [pincode, setPincode] = useState('');
  const [status, setStatus] = useState<Status>('idle');

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setStatus(PINCODE_PATTERN.test(pincode) ? 'valid' : 'invalid');
  }

  return (
    <div className={styles.card}>
      <p className={styles.heading}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
          <path d="M12 21s7-6.3 7-11.5A7 7 0 0 0 5 9.5C5 14.7 12 21 12 21z" />
          <circle cx="12" cy="9.5" r="2.5" />
        </svg>
        Check Delivery &amp; Availability
      </p>
      <form className={styles.row} onSubmit={handleSubmit}>
        <input
          type="text"
          inputMode="numeric"
          maxLength={6}
          placeholder="Enter Pincode"
          className={styles.input}
          value={pincode}
          onChange={(e) => {
            setPincode(e.target.value.replace(/\D/g, ''));
            setStatus('idle');
          }}
          aria-label="Pincode"
          aria-invalid={status === 'invalid'}
        />
        <button type="submit" className={styles.checkButton}>
          Check
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
        </button>
      </form>
      {status === 'invalid' && <p className={styles.error}>Please enter a valid 6-digit pincode.</p>}
      {status === 'valid' && (
        <p className={styles.success}>Estimated delivery in 3–7 business days across India.</p>
      )}
    </div>
  );
}
