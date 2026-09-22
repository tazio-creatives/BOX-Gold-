import { query } from '../config/db.js';

// "Active" = still open for the customer/admin (not yet rejected or
// completed) — used to block a second submission while one is already in
// flight, and to decide what the storefront shows instead of the request form.
const ACTIVE_STATUSES = ['REQUESTED', 'APPROVED'];

export async function findReturnRequestByOrderId(orderId) {
  const { rows } = await query(
    `SELECT r.*, a.full_name AS resolved_by_admin_name
     FROM return_requests r
     LEFT JOIN admin_users a ON a.id = r.resolved_by_admin_user_id
     WHERE r.order_id = $1
     ORDER BY r.created_at DESC
     LIMIT 1`,
    [orderId],
  );
  return rows[0] ?? null;
}

export async function hasActiveReturnRequest(orderId) {
  const { rows } = await query(
    `SELECT 1 FROM return_requests WHERE order_id = $1 AND status = ANY($2) LIMIT 1`,
    [orderId, ACTIVE_STATUSES],
  );
  return rows.length > 0;
}

export async function insertReturnRequest(orderId, { reason, note, videoUrl }) {
  const { rows } = await query(
    `INSERT INTO return_requests (order_id, reason, note, video_url)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [orderId, reason, note ?? null, videoUrl ?? null],
  );
  return rows[0];
}

export async function updateReturnRequestStatus(id, status, adminId) {
  const { rows } = await query(
    `UPDATE return_requests
     SET status = $2, resolved_at = now(), resolved_by_admin_user_id = $3
     WHERE id = $1
     RETURNING *`,
    [id, status, adminId],
  );
  return rows[0] ?? null;
}
