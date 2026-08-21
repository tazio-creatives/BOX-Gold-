import { useRef, useState } from 'react';
import sharedStyles from '../../styles/shared.module.css';
import styles from './UploadStep.module.css';

const ALLOWED_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
const MAX_FILE_SIZE_MB = 10;

const SLOT_LABELS = ['Primary Image', 'Supporting Angle 1', 'Supporting Angle 2', 'Supporting Angle 3'];

function validateFile(file: File): string | null {
  if (!ALLOWED_TYPES.has(file.type)) return 'Please choose a PNG, JPG, JPEG, or WebP image.';
  if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) return `Image must be smaller than ${MAX_FILE_SIZE_MB}MB.`;
  return null;
}

interface UploadStepProps {
  onSubmit: (_files: File[]) => void;
  isPending: boolean;
  error: string | null;
}

// Slot 0 is always the primary (required) image; slots 1-3 are optional
// supporting angles. The backend treats files[0] as primary — order here IS
// the contract, not just display.
export function UploadStep({ onSubmit, isPending, error }: UploadStepProps) {
  const [slots, setSlots] = useState<(File | null)[]>([null, null, null, null]);
  const [previews, setPreviews] = useState<(string | null)[]>([null, null, null, null]);
  const [validationError, setValidationError] = useState<string | null>(null);
  const fileInputRefs = [useRef<HTMLInputElement>(null), useRef<HTMLInputElement>(null), useRef<HTMLInputElement>(null), useRef<HTMLInputElement>(null)];

  function setSlot(index: number, file: File) {
    const err = validateFile(file);
    if (err) {
      setValidationError(err);
      return;
    }
    setValidationError(null);
    setSlots((s) => s.map((f, i) => (i === index ? file : f)));
    setPreviews((p) => p.map((url, i) => (i === index ? URL.createObjectURL(file) : url)));
  }

  function clearSlot(index: number) {
    setSlots((s) => s.map((f, i) => (i === index ? null : f)));
    setPreviews((p) => p.map((url, i) => (i === index ? null : url)));
  }

  const hasPrimary = !!slots[0];

  return (
    <div>
      <p>Upload a primary jewellery reference photo, plus up to 3 optional supporting angles.</p>

      <div className={styles.slotGrid}>
        {SLOT_LABELS.map((label, i) => (
          <div key={label} className={styles.slot}>
            <p className={styles.slotLabel}>
              {label} {i === 0 ? '(required)' : '(optional)'}
              {i === 0 && <span className={styles.primaryBadge}>Primary</span>}
            </p>
            <input
              ref={fileInputRefs[i]}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              hidden
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) setSlot(i, file);
                e.target.value = '';
              }}
            />
            {previews[i] ? (
              <div className={styles.filled}>
                <img src={previews[i] as string} alt={label} className={styles.previewImg} />
                <div className={styles.slotActions}>
                  <button type="button" className={sharedStyles.buttonLink} onClick={() => fileInputRefs[i].current?.click()}>
                    Replace
                  </button>
                  <button type="button" className={sharedStyles.buttonLink} onClick={() => clearSlot(i)}>
                    Remove
                  </button>
                </div>
              </div>
            ) : (
              <button type="button" className={styles.empty} onClick={() => fileInputRefs[i].current?.click()}>
                <span>Click to upload</span>
                <span className={styles.hint}>
                  PNG, JPG, JPEG, or WebP — up to {MAX_FILE_SIZE_MB}MB
                </span>
              </button>
            )}
          </div>
        ))}
      </div>

      {(validationError || error) && <p className={sharedStyles.error}>{validationError ?? error}</p>}

      <div className={styles.actions}>
        <button
          type="button"
          className={sharedStyles.buttonPrimary}
          disabled={!hasPrimary || isPending}
          onClick={() => onSubmit(slots.filter((f): f is File => f !== null))}
        >
          {isPending ? 'Uploading…' : 'Analyse Jewellery'}
        </button>
      </div>
    </div>
  );
}
