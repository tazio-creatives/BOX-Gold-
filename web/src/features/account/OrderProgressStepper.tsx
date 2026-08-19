import styles from './OrderProgressStepper.module.css';

interface OrderProgressStepperProps {
  createdAt: string;
  confirmedAt: string | null;
  shippedAt: string | null;
  deliveredAt: string | null;
}

const STEP_LABELS = ['Order placed', 'Confirmed', 'Shipped', 'Delivered'];

function shortDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

// Happy-path only — createdAt is always present the moment an order exists,
// so completedCount is always >= 1. Callers should not render this for
// terminal failure states (CANCELLED/PAYMENT_FAILED/EXPIRED), where a
// 4-step "on the way to delivery" tracker doesn't represent what happened;
// the status badge already covers those.
export function OrderProgressStepper({ createdAt, confirmedAt, shippedAt, deliveredAt }: OrderProgressStepperProps) {
  const dates = [createdAt, confirmedAt, shippedAt, deliveredAt];
  const completedCount = dates.filter(Boolean).length;

  return (
    <ol className={styles.stepper} aria-label="Order progress">
      {STEP_LABELS.map((label, i) => {
        const date = dates[i];
        return (
          <li key={label} className={styles.stepWrap}>
            <div className={styles.dotRow}>
              <span className={`${styles.dot} ${i < completedCount ? styles.dotComplete : ''}`} aria-hidden="true" />
              {i < STEP_LABELS.length - 1 && (
                <span
                  className={`${styles.connector} ${i < completedCount - 1 ? styles.connectorComplete : ''}`}
                  aria-hidden="true"
                />
              )}
            </div>
            <span className={`${styles.label} ${i < completedCount ? styles.labelComplete : ''}`}>{label}</span>
            {date && <span className={styles.date}>{shortDate(date)}</span>}
          </li>
        );
      })}
    </ol>
  );
}
