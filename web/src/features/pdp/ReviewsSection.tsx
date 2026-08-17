import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchReviews } from '../../api/reviews';
import { Pagination } from '../../components/Pagination';
import styles from './ReviewsSection.module.css';

function Stars({ rating }: { rating: number }) {
  return (
    <span className={styles.stars} aria-label={`${rating} out of 5 stars`}>
      {'★'.repeat(rating)}
      {'☆'.repeat(5 - rating)}
    </span>
  );
}

export function ReviewsSection({ productId }: { productId: string }) {
  const [page, setPage] = useState(1);
  const { data, isLoading } = useQuery({
    queryKey: ['reviews', productId, page],
    queryFn: () => fetchReviews(productId, page),
  });

  if (isLoading) {
    return (
      <ul className={styles.list} aria-busy="true">
        {Array.from({ length: 3 }).map((_, i) => (
          <li key={i} className={styles.review}>
            <div className={styles.skeletonLine} style={{ width: 100, marginBottom: 10 }} />
            <div className={styles.skeletonLine} style={{ width: '90%', marginBottom: 6 }} />
            <div className={styles.skeletonLine} style={{ width: '70%', marginBottom: 10 }} />
            <div className={styles.skeletonLine} style={{ width: 140 }} />
          </li>
        ))}
      </ul>
    );
  }
  if (!data || data.reviews.length === 0) {
    return <p className={styles.empty}>No reviews yet — be the first to review this piece.</p>;
  }

  return (
    <div>
      <ul className={styles.list}>
        {data.reviews.map((review) => (
          <li key={review.id} className={styles.review}>
            <div className={styles.reviewHeader}>
              <Stars rating={review.rating} />
              {review.isVerifiedPurchase && <span className={styles.verifiedBadge}>Verified Purchase</span>}
            </div>
            {review.title && <p className={styles.reviewTitle}>{review.title}</p>}
            {review.body && <p className={styles.reviewBody}>{review.body}</p>}
            <p className={styles.reviewMeta}>
              {review.reviewerName} ·{' '}
              {new Date(review.createdAt).toLocaleDateString('en-IN', { dateStyle: 'medium' })}
            </p>
          </li>
        ))}
      </ul>
      <Pagination page={data.page} totalPages={data.totalPages} onChange={setPage} />
    </div>
  );
}
