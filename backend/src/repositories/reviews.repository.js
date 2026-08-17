import { query } from '../config/db.js';

export async function findReviewByOrderItemId(orderItemId) {
  const { rows } = await query('SELECT * FROM reviews WHERE order_item_id = $1', [orderItemId]);
  return rows[0] ?? null;
}

// Used to annotate an order's items with whether they've already been
// reviewed (plan §11a "Write a Review" eligibility on the order page).
export async function findReviewedOrderItemIds(orderItemIds) {
  if (orderItemIds.length === 0) return [];
  const { rows } = await query('SELECT order_item_id FROM reviews WHERE order_item_id = ANY($1)', [
    orderItemIds,
  ]);
  return rows.map((r) => r.order_item_id);
}

export async function insertReview({ productId, userId, orderItemId, rating, title, body, isVerifiedPurchase }) {
  const { rows } = await query(
    `INSERT INTO reviews (product_id, user_id, order_item_id, rating, title, body, is_verified_purchase, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'PENDING') RETURNING *`,
    [productId, userId, orderItemId, rating, title ?? null, body ?? null, isVerifiedPurchase ?? false],
  );
  return rows[0];
}

export async function findApprovedReviewsByProduct(productId, { page = 1, limit = 10 } = {}) {
  const offset = (page - 1) * limit;
  const { rows } = await query(
    `SELECT r.*, u.full_name FROM reviews r
     JOIN users u ON u.id = r.user_id
     WHERE r.product_id = $1 AND r.status = 'APPROVED'
     ORDER BY r.created_at DESC LIMIT $2 OFFSET $3`,
    [productId, limit, offset],
  );
  const {
    rows: [{ count }],
  } = await query(`SELECT COUNT(*)::int AS count FROM reviews WHERE product_id = $1 AND status = 'APPROVED'`, [
    productId,
  ]);
  return { items: rows, total: count };
}

export async function findReviewsForModeration({ status, page = 1, limit = 20 } = {}) {
  const clauses = [];
  const params = [];
  if (status) {
    params.push(status);
    clauses.push(`r.status = $${params.length}`);
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const offset = (page - 1) * limit;
  const listParams = [...params, limit, offset];

  const { rows } = await query(
    `SELECT r.*, u.full_name, u.mobile_number, p.name AS product_name, p.slug AS product_slug
     FROM reviews r
     JOIN users u ON u.id = r.user_id
     JOIN products p ON p.id = r.product_id
     ${where}
     ORDER BY r.created_at DESC
     LIMIT $${listParams.length - 1} OFFSET $${listParams.length}`,
    listParams,
  );
  const {
    rows: [{ count }],
  } = await query(`SELECT COUNT(*)::int AS count FROM reviews r ${where}`, params);
  return { items: rows, total: count };
}

export async function findReviewById(id) {
  const { rows } = await query('SELECT * FROM reviews WHERE id = $1', [id]);
  return rows[0] ?? null;
}

export async function updateReviewStatusTx(client, id, status) {
  const { rows } = await client.query('UPDATE reviews SET status = $2 WHERE id = $1 RETURNING *', [
    id,
    status,
  ]);
  return rows[0];
}

// Denormalized aggregate (plan §3 "avoids a join/aggregate per listing row
// on the PLP") — recomputed from APPROVED reviews only, every time a
// review's status changes.
export async function recalculateProductRatingTx(client, productId) {
  const {
    rows: [{ avg, count }],
  } = await client.query(
    `SELECT COALESCE(AVG(rating), 0) AS avg, COUNT(*)::int AS count
     FROM reviews WHERE product_id = $1 AND status = 'APPROVED'`,
    [productId],
  );
  await client.query('UPDATE products SET rating_avg = $2, rating_count = $3 WHERE id = $1', [
    productId,
    Number(avg).toFixed(2),
    count,
  ]);
}
