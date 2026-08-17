import { query } from '../config/db.js';

// Read while holding the FOR UPDATE lock on the product (and, for sized
// lines, the product_sizes) row (plan §11) — gives the true "available right
// now" figure with no race window. Sized reservations are counted against
// the size, not the product, so a sizeId here filters to just that size.
export async function getActiveReservedQuantityTx(client, productId, sizeId = null) {
  const { rows } = sizeId
    ? await client.query(
        `SELECT COALESCE(SUM(quantity), 0)::int AS reserved
         FROM stock_reservations WHERE product_size_id = $1 AND status = 'ACTIVE'`,
        [sizeId],
      )
    : await client.query(
        `SELECT COALESCE(SUM(quantity), 0)::int AS reserved
         FROM stock_reservations WHERE product_id = $1 AND product_size_id IS NULL AND status = 'ACTIVE'`,
        [productId],
      );
  return rows[0].reserved;
}

export async function insertReservationTx(
  client,
  { productId, productSizeId, orderId, quantity, expiresAt },
) {
  const { rows } = await client.query(
    `INSERT INTO stock_reservations (product_id, product_size_id, order_id, quantity, status, expires_at)
     VALUES ($1, $2, $3, $4, 'ACTIVE', $5) RETURNING *`,
    [productId, productSizeId ?? null, orderId, quantity, expiresAt],
  );
  return rows[0];
}

export async function findReservationsForOrderTx(client, orderId) {
  const { rows } = await client.query('SELECT * FROM stock_reservations WHERE order_id = $1', [
    orderId,
  ]);
  return rows;
}

// Payment webhook success path (plan §11): the hold becomes a real
// decrement — CONFIRMED reservations no longer count toward "reserved" (the
// stock they cover is now permanently gone from stock_quantity instead).
export async function confirmReservationsForOrderTx(client, orderId) {
  const reservations = await findReservationsForOrderTx(client, orderId);
  for (const reservation of reservations) {
    if (reservation.status !== 'ACTIVE') continue;
    if (reservation.product_size_id) {
      await client.query(
        `UPDATE product_sizes SET stock_quantity = stock_quantity - $2 WHERE id = $1`,
        [reservation.product_size_id, reservation.quantity],
      );
    } else {
      await client.query(
        `UPDATE products SET stock_quantity = stock_quantity - $2 WHERE id = $1`,
        [reservation.product_id, reservation.quantity],
      );
    }
    await client.query(`UPDATE stock_reservations SET status = 'CONFIRMED' WHERE id = $1`, [
      reservation.id,
    ]);
  }
}

// Sweep job / cancellation path — no stock impact since nothing was ever
// decremented for an ACTIVE reservation, just releases the hold.
export async function releaseReservationsForOrderTx(client, orderId) {
  await client.query(
    `UPDATE stock_reservations SET status = 'RELEASED' WHERE order_id = $1 AND status = 'ACTIVE'`,
    [orderId],
  );
}

export async function findExpiredActiveReservationOrderIds() {
  const { rows } = await query(
    `SELECT DISTINCT order_id FROM stock_reservations
     WHERE status = 'ACTIVE' AND expires_at < now()`,
  );
  return rows.map((r) => r.order_id);
}
