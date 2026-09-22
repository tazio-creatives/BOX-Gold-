import type { ReturnRequest } from '../../api/types';
import { RefreshIcon } from './OrderHeroIcons';
import sharedStyles from '../../styles/shared.module.css';
import contentStyles from './OrderDetailPage.module.css';
import styles from './ReturnRequestCard.module.css';

const REASON_LABELS: Record<ReturnRequest['reason'], string> = {
  DAMAGED: 'Damaged',
  DEFECTIVE: 'Defective',
  WRONG_ITEM: 'Wrong Item',
  NOT_AS_DESCRIBED: 'Not as Described',
  CHANGED_MIND: 'Changed Mind',
  OTHER: 'Other',
};

const STATUS_BADGE: Record<ReturnRequest['status'], keyof typeof sharedStyles> = {
  REQUESTED: 'badgeWarning',
  APPROVED: 'badgeInfo',
  REJECTED: 'badgeDanger',
  COMPLETED: 'badgeSuccess',
};

// Shown in both compact and full order views whenever a customer has
// submitted a return request — a lightweight approve/reject review trail,
// deliberately separate from order_status (which the admin still moves to
// RETURNED via the existing Change Status control once the return is
// physically received and inspected; that transition auto-marks this
// request COMPLETED, see adminOrders.controller.js).
export function ReturnRequestCard({
  returnRequest,
  onApprove,
  onReject,
  isPending,
}: {
  returnRequest: ReturnRequest;
  onApprove: () => void;
  onReject: () => void;
  isPending: boolean;
}) {
  return (
    <section className={sharedStyles.cardPadded}>
      <div className={styles.headingRow}>
        <h2 className={contentStyles.sectionHeadingIcon}>
          <RefreshIcon size={16} /> Return Request
        </h2>
        <span className={sharedStyles[STATUS_BADGE[returnRequest.status]]}>{returnRequest.status}</span>
      </div>

      <div className={styles.detailRow}>
        <span className={styles.label}>Reason</span>
        <span>{REASON_LABELS[returnRequest.reason]}</span>
      </div>
      {returnRequest.note && (
        <div className={styles.detailRow}>
          <span className={styles.label}>Note</span>
          <span>{returnRequest.note}</span>
        </div>
      )}
      <div className={styles.detailRow}>
        <span className={styles.label}>Submitted</span>
        <span>
          {new Date(returnRequest.createdAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
        </span>
      </div>
      {returnRequest.videoUrl && (
        <div className={styles.detailRow}>
          <span className={styles.label}>Unboxing Video</span>
          <a href={returnRequest.videoUrl} target="_blank" rel="noreferrer">
            View video
          </a>
        </div>
      )}
      {returnRequest.resolvedAt && (
        <div className={styles.detailRow}>
          <span className={styles.label}>Resolved</span>
          <span>
            {new Date(returnRequest.resolvedAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
            {returnRequest.resolvedByAdminName ? ` by ${returnRequest.resolvedByAdminName}` : ''}
          </span>
        </div>
      )}

      {returnRequest.status === 'REQUESTED' && (
        <div className={styles.actions}>
          <button type="button" className={sharedStyles.buttonPrimary} disabled={isPending} onClick={onApprove}>
            Approve
          </button>
          <button type="button" className={sharedStyles.buttonDanger} disabled={isPending} onClick={onReject}>
            Reject
          </button>
        </div>
      )}
    </section>
  );
}
