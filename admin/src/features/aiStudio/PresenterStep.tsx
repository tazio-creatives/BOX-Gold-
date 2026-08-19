import type { PresenterStyle } from '../../api/aiStudio';
import styles from './PresenterStep.module.css';

const OPTIONS: { value: PresenterStyle; title: string; description: string }[] = [
  { value: 'CONTEMPORARY', title: 'Contemporary', description: 'Clean, modern, premium studio styling.' },
  { value: 'TRADITIONAL', title: 'Traditional', description: 'Graceful ethnic/festive styling.' },
];

interface PresenterStepProps {
  value: PresenterStyle | '';
  onChange: (_v: PresenterStyle) => void;
}

// Chosen before generation, not after — the presenter image is one of the
// four required outputs, so its style must be fixed before that call runs.
export function PresenterStep({ value, onChange }: PresenterStepProps) {
  return (
    <div>
      <p>Choose exactly one presenter style — it will be used for the presenter image.</p>
      <div className={styles.grid}>
        {OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            className={value === opt.value ? styles.cardSelected : styles.card}
            onClick={() => onChange(opt.value)}
            aria-pressed={value === opt.value}
          >
            <p className={styles.title}>{opt.title}</p>
            <p className={styles.description}>{opt.description}</p>
          </button>
        ))}
      </div>
    </div>
  );
}
