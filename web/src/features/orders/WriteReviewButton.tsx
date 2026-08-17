import { useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { submitReview } from '../../api/reviews';
import { ApiError } from '../../api/client';
import styles from './WriteReviewButton.module.css';

interface WriteReviewButtonProps {
  productId: string;
  orderItemId: string;
  orderId: string;
  canReview: boolean;
}

export function WriteReviewButton({ productId, orderItemId, orderId, canReview }: WriteReviewButtonProps) {
  const queryClient = useQueryClient();
  const [isOpen, setIsOpen] = useState(false);
  const [rating, setRating] = useState(5);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () => submitReview(productId, { rating, title: title || null, body: body || null, orderItemId }),
    onSuccess: () => {
      setSubmitted(true);
      setIsOpen(false);
      queryClient.invalidateQueries({ queryKey: ['order', orderId] });
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Could not submit review.'),
  });

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    mutation.mutate();
  }

  if (submitted) {
    return <p className={styles.submittedNote}>Thanks — your review is pending moderation.</p>;
  }

  if (!canReview) {
    return null;
  }

  if (!isOpen) {
    return (
      <button type="button" className={styles.writeButton} onClick={() => setIsOpen(true)}>
        Write a Review
      </button>
    );
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      <div className={styles.starsInput}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            className={n <= rating ? styles.starActive : styles.star}
            onClick={() => setRating(n)}
            aria-label={`${n} star${n > 1 ? 's' : ''}`}
          >
            ★
          </button>
        ))}
      </div>
      <input
        className={styles.input}
        placeholder="Title (optional)"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
      />
      <textarea
        className={styles.textarea}
        placeholder="Share your thoughts (optional)"
        rows={3}
        value={body}
        onChange={(e) => setBody(e.target.value)}
      />
      {error && <p className={styles.error}>{error}</p>}
      <div className={styles.actions}>
        <button type="submit" className={styles.submitButton} disabled={mutation.isPending}>
          {mutation.isPending ? 'Submitting…' : 'Submit Review'}
        </button>
        <button type="button" className={styles.cancelButton} onClick={() => setIsOpen(false)}>
          Cancel
        </button>
      </div>
    </form>
  );
}
