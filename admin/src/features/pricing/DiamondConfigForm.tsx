import { useState, type FormEvent } from 'react';
import type { DiamondConfig } from '../../api/types';
import { ApiError } from '../../api/client';
import sharedStyles from '../../styles/shared.module.css';

interface DiamondConfigFormProps {
  initial?: DiamondConfig;
  onSubmit: (input: { name: string; ratePerCent: number; isActive: boolean }) => Promise<unknown>;
  onCancel: () => void;
}

export function DiamondConfigForm({ initial, onSubmit, onCancel }: DiamondConfigFormProps) {
  const [name, setName] = useState(initial?.name ?? '');
  const [ratePerCent, setRatePerCent] = useState(initial?.ratePerCent ?? 0);
  const [isActive, setIsActive] = useState(initial?.isActive ?? true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      await onSubmit({ name, ratePerCent, isActive });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save diamond quality tier.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className={sharedStyles.cardPadded}>
      <div className={sharedStyles.formGrid}>
        <label className={sharedStyles.field}>
          Name
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. VS1 Natural"
            required
          />
        </label>
        <label className={sharedStyles.field}>
          Rate per cent (₹)
          <input
            type="number"
            min="0"
            step="0.01"
            value={ratePerCent}
            onChange={(e) => setRatePerCent(Number(e.target.value))}
            required
          />
        </label>
        <label className={`${sharedStyles.field} ${sharedStyles.checkboxField}`}>
          <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
          Active
        </label>
      </div>

      {error && <p className={sharedStyles.error}>{error}</p>}

      <div className={sharedStyles.formActions}>
        <button type="submit" className={sharedStyles.buttonPrimary} disabled={isSubmitting}>
          {isSubmitting ? 'Saving…' : 'Save'}
        </button>
        <button type="button" className={sharedStyles.button} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}
