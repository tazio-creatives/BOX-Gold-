import type { StudioJobStatus } from '../../api/aiStudio';
import styles from './StudioStepper.module.css';

const STEPS = [
  { label: 'Upload', statuses: ['draft', 'uploading'] },
  { label: 'Analyse & Confirm', statuses: ['analysing'] },
  { label: 'Choose Presenter', statuses: [] as string[] },
  { label: 'Generate', statuses: ['generating'] },
  { label: 'Review & Import', statuses: ['review_ready', 'partially_failed', 'importing', 'completed'] },
] as const;

// 'awaiting_confirmation' covers both step 1 (Analyse & Confirm) and step 2
// (Choose Presenter) on the backend — confirmSubStep disambiguates which
// screen the wizard is actually showing right now.
function stepIndexForStatus(status: StudioJobStatus | null, confirmSubStep: 'analyse' | 'presenter'): number {
  if (!status) return 0;
  if (status === 'failed' || status === 'cancelled') return -1;
  if (status === 'awaiting_confirmation') return confirmSubStep === 'presenter' ? 2 : 1;
  return STEPS.findIndex((s) => (s.statuses as readonly string[]).includes(status));
}

interface StudioStepperProps {
  status: StudioJobStatus | null;
  confirmSubStep: 'analyse' | 'presenter';
  generateCount: number;
}

export function StudioStepper({ status, confirmSubStep, generateCount }: StudioStepperProps) {
  const activeIndex = stepIndexForStatus(status, confirmSubStep);

  return (
    <ol className={styles.stepper}>
      {STEPS.map((step, i) => {
        const isDone = activeIndex > i || status === 'completed';
        const isActive = activeIndex === i && status !== 'completed';
        const label = i === 3 ? `Generate ${generateCount} Image${generateCount === 1 ? '' : 's'}` : step.label;
        return (
          <li key={step.label} className={styles.step}>
            <span className={isActive ? styles.dotActive : isDone ? styles.dotDone : styles.dot}>{i + 1}</span>
            <span className={isActive ? styles.labelActive : styles.label}>{label}</span>
          </li>
        );
      })}
    </ol>
  );
}
