import { withTransaction } from '../config/db.js';
import { AppError, ForbiddenError, NotFoundError } from '../utils/AppError.js';
import { findOrderItemById, findOrderById } from '../repositories/orders.repository.js';
import {
  findReviewByOrderItemId,
  insertReview,
  findApprovedReviewsByProduct,
  findReviewsForModeration,
  findReviewById,
  updateReviewStatusTx,
  recalculateProductRatingTx,
} from '../repositories/reviews.repository.js';

// plan §11a: reviews only accepted for a delivered order that actually
// belongs to the reviewer, one review per order_item (also enforced by the
// partial unique index at the DB level — this check just gives a clean 400
// instead of a raw constraint-violation 500).
export async function createReview(userId, productId, input) {
  const orderItem = await findOrderItemById(input.orderItemId);
  if (!orderItem) throw new NotFoundError('Order item not found');
  if (orderItem.product_id !== productId) {
    throw new AppError(400, 'That order item is not for this product');
  }

  const order = await findOrderById(orderItem.order_id);
  if (!order || order.user_id !== userId) throw new ForbiddenError('Not your order');
  if (order.status !== 'DELIVERED') {
    throw new AppError(400, 'You can only review items from delivered orders');
  }

  const existing = await findReviewByOrderItemId(input.orderItemId);
  if (existing) throw new AppError(400, 'You already reviewed this item');

  return insertReview({
    productId,
    userId,
    orderItemId: input.orderItemId,
    rating: input.rating,
    title: input.title,
    body: input.body,
    isVerifiedPurchase: true,
  });
}

export function getApprovedReviews(productId, pagination) {
  return findApprovedReviewsByProduct(productId, pagination);
}

export function getModerationQueue(filters) {
  return findReviewsForModeration(filters);
}

export async function approveReview(id) {
  const review = await findReviewById(id);
  if (!review) throw new NotFoundError('Review not found');
  if (review.status === 'APPROVED') return review;

  return withTransaction(async (client) => {
    const updated = await updateReviewStatusTx(client, id, 'APPROVED');
    await recalculateProductRatingTx(client, review.product_id);
    return updated;
  });
}

export async function rejectReview(id) {
  const review = await findReviewById(id);
  if (!review) throw new NotFoundError('Review not found');
  if (review.status === 'REJECTED') return review;

  return withTransaction(async (client) => {
    const updated = await updateReviewStatusTx(client, id, 'REJECTED');
    // Only needs a recalc if it was previously counted (APPROVED -> REJECTED
    // reverses a moderation decision); PENDING -> REJECTED never affected
    // the aggregate in the first place.
    if (review.status === 'APPROVED') await recalculateProductRatingTx(client, review.product_id);
    return updated;
  });
}
