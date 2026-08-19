import type { StudioJobStatus } from '../../api/aiStudio';
import styles from './StudioStepper.module.css';

const STEPS = [
  { label: 'Upload', statuses: ['draft', 'uploading'] },
  { label: 'Analyse & Confirm', statuses: ['analysing', 'awaiting_confirmation'] },
  { label: 'Choose Presenter', statuses: ['awaiting_confirmation'] },
  { label: 'Generate 4 Images', statuses: ['generating'] },
  { label: 'Review & Import', statuses: ['review_ready', 'partially_failed', 'importing', 'completed'] },
] as const;

// Index of the step the job's current status belongs to. 'awaiting_confirmation'
// deliberately maps to "Analyse & Confirm" here — the presenter pick happens
// within that same backend status, one screen later in the wizard UI only.
function stepIndexForStatus(status: StudioJobStatus | null): number {
  if (!status) return 0;
  if (status === 'failed' || status === 'cancelled') return -1;
  return STEPS.findIndex((s) => (s.statuses as readonly string[]).includes(status));
}

export function StudioStepper({ status }: { status: StudioJobStatus | null }) {
  const activeIndex = stepIndexForStatus(status);

  return (
    <ol className={styles.stepper}>
      {STEPS.map((step, i) => {
        const isDone = activeIndex > i || status === 'completed';
        const isActive = activeIndex === i && status !== 'completed';
        return (
          <li key={step.label} className={styles.step}>
            <span className={isActive ? styles.dotActive : isDone ? styles.dotDone : styles.dot}>{i + 1}</span>
            <span className={isActive ? styles.labelActive : styles.label}>{step.label}</span>
          </li>
        );
      })}
    </ol>
  );
}
