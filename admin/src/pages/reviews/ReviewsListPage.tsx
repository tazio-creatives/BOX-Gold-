import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { fetchAdminReviews, approveReview, rejectReview } from '../../api/reviews';
import type { ReviewStatus } from '../../api/types';
import sharedStyles from '../../styles/shared.module.css';
import styles from './ReviewsListPage.module.css';

const STATUSES: ReviewStatus[] = ['PENDING', 'APPROVED', 'REJECTED'];

const STATUS_CLASS: Record<ReviewStatus, string> = {
  PENDING: 'badgeWarning',
  APPROVED: 'badgeSuccess',
  REJECTED: 'badgeDanger',
};

function Stars({ rating }: { rating: number }) {
  return (
    <span className={styles.stars}>
      {'★'.repeat(rating)}
      {'☆'.repeat(5 - rating)}
    </span>
  );
}

export function ReviewsListPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const status = (searchParams.get('status') as ReviewStatus | null) ?? 'PENDING';
  const [page, setPage] = useState(1);
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['admin-reviews', { status, page }],
    queryFn: () => fetchAdminReviews(status || undefined, page, 20),
  });

  const approveMutation = useMutation({
    mutationFn: approveReview,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-reviews'] }),
  });

  const rejectMutation = useMutation({
    mutationFn: rejectReview,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-reviews'] }),
  });

  return (
    <div>
      <div className={sharedStyles.pageHeader}>
        <h1 className={sharedStyles.pageTitle}>Reviews</h1>
      </div>

      <div className={styles.filters}>
        <select
          value={status}
          onChange={(e) => {
            const next = new URLSearchParams(searchParams);
            if (e.target.value) next.set('status', e.target.value);
            else next.delete('status');
            setSearchParams(next);
            setPage(1);
          }}
        >
          <option value="">All statuses</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>

      <div className={sharedStyles.card}>
        {isLoading && <p className={sharedStyles.empty}>Loading…</p>}
        {!isLoading && data && data.reviews.length === 0 && (
          <p className={sharedStyles.empty}>No reviews match this filter.</p>
        )}
        {!isLoading && data && data.reviews.length > 0 && (
          <table className={sharedStyles.table}>
            <thead>
              <tr>
                <th>Product</th>
                <th>Rating</th>
                <th>Review</th>
                <th>Reviewer</th>
                <th>Status</th>
                <th>Submitted</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {data.reviews.map((review) => (
                <tr key={review.id}>
                  <td>{review.productName}</td>
                  <td>
                    <Stars rating={review.rating} />
                  </td>
                  <td className={styles.reviewCell}>
                    {review.title && <p className={styles.reviewTitle}>{review.title}</p>}
                    {review.body && <p className={styles.reviewBody}>{review.body}</p>}
                  </td>
                  <td>
                    {review.reviewerName}
                    <div className={styles.mobile}>{review.reviewerMobile}</div>
                  </td>
                  <td>
                    <span className={sharedStyles[STATUS_CLASS[review.status]]}>{review.status}</span>
                  </td>
                  <td>{new Date(review.createdAt).toLocaleDateString('en-IN')}</td>
                  <td>
                    {review.status === 'PENDING' && (
                      <div className={styles.actions}>
                        <button
                          type="button"
                          className={sharedStyles.buttonPrimary}
                          disabled={approveMutation.isPending || rejectMutation.isPending}
                          onClick={() => approveMutation.mutate(review.id)}
                        >
                          Approve
                        </button>
                        <button
                          type="button"
                          className={sharedStyles.buttonDanger}
                          disabled={approveMutation.isPending || rejectMutation.isPending}
                          onClick={() => rejectMutation.mutate(review.id)}
                        >
                          Reject
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {data && data.totalPages > 1 && (
        <div className={sharedStyles.pagination}>
          <button type="button" className={sharedStyles.button} disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            Previous
          </button>
          <span>
            Page {data.page} of {data.totalPages}
          </span>
          <button
            type="button"
            className={sharedStyles.button}
            disabled={page >= data.totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
