import { query } from '../config/db.js';

// Locks the product row for the duration of the checkout transaction (plan
// §11) — the SELECT ... FOR UPDATE is what makes the stock check+reserve
// atomic across concurrent checkouts. Callers must lock rows for a
// multi-item order in ascending product_id order to avoid deadlocks.
export async function lockProductForCheckoutTx(client, productId) {
  const { rows } = await client.query(
    `SELECT id, name, sku, status, metal_type, purity, gold_color, gold_value, diamond_value,
            making_charge, gst_percent, selling_price, stock_quantity,
            net_weight_grams, diamond_weight_carats, diamond_config_id
     FROM products WHERE id = $1 FOR UPDATE`,
    [productId],
  );
  return rows[0] ?? null;
}

// Row-level locks don't cascade — locking the product row above says nothing
// about a specific size row underneath it, so a sized line also locks its
// product_sizes row before the stock check+reserve.
export async function lockProductSizeForCheckoutTx(client, sizeId) {
  const { rows } = await client.query(
    `SELECT id, product_id, label, stock_quantity FROM product_sizes WHERE id = $1 FOR UPDATE`,
    [sizeId],
  );
  return rows[0] ?? null;
}

const ORDER_COLUMNS = [
  'order_number',
  'user_id',
  'status',
  'contact_name',
  'contact_mobile',
  'contact_email',
  'shipping_address',
  'subtotal',
  'discount_amount',
  'gst_amount',
  'shipping_amount',
  'total_amount',
  'coupon_id',
  'coupon_code',
];

const ORDER_FIELD_MAP = Object.fromEntries(
  ORDER_COLUMNS.map((column) => [column.replace(/_([a-z])/g, (_, c) => c.toUpperCase()), column]),
);

export async function insertOrderTx(client, fields) {
  const columns = [];
  const placeholders = [];
  const values = [];
  for (const [key, column] of Object.entries(ORDER_FIELD_MAP)) {
    if (Object.hasOwn(fields, key)) {
      values.push(column === 'shipping_address' ? JSON.stringify(fields[key]) : fields[key]);
      columns.push(column);
      placeholders.push(column === 'shipping_address' ? `$${values.length}::jsonb` : `$${values.length}`);
    }
  }
  const { rows } = await client.query(
    `INSERT INTO orders (${columns.join(', ')}) VALUES (${placeholders.join(', ')}) RETURNING *`,
    values,
  );
  return rows[0];
}

export async function insertOrderItemTx(client, fields) {
  const { rows } = await client.query(
    `INSERT INTO order_items
       (order_id, product_id, product_name, product_sku, quantity,
        gold_value, diamond_value, making_charge, gst_amount, unit_price, line_total, gold_rate_id,
        product_size_id, product_size_label, gold_color, purity, diamond_config_id, diamond_config_name)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
     RETURNING *`,
    [
      fields.orderId,
      fields.productId,
      fields.productName,
      fields.productSku,
      fields.quantity,
      fields.goldValue,
      fields.diamondValue,
      fields.makingCharge,
      fields.gstAmount,
      fields.unitPrice,
      fields.lineTotal,
      fields.goldRateId ?? null,
      fields.productSizeId ?? null,
      fields.productSizeLabel ?? null,
      fields.goldColor ?? null,
      fields.purity ?? null,
      fields.diamondConfigId ?? null,
      fields.diamondConfigName ?? null,
    ],
  );
  return rows[0];
}

export async function insertOrderStatusHistoryTx(client, orderId, status, note = null) {
  await client.query(
    'INSERT INTO order_status_history (order_id, status, note) VALUES ($1, $2, $3)',
    [orderId, status, note],
  );
}

export async function updateOrderStatusTx(client, orderId, status) {
  const { rows } = await client.query(
    'UPDATE orders SET status = $2, updated_at = now() WHERE id = $1 RETURNING *',
    [orderId, status],
  );
  return rows[0] ?? null;
}

// Atomic compare-and-swap, not a read-then-write — the reservation sweep
// (plan §11 2b) races against the payment webhook by design (both can run
// for the same order at nearly the same moment), so the WHERE status =
// 'PENDING_PAYMENT' guard is what stops a just-CONFIRMED order from ever
// being clobbered back to EXPIRED.
export async function expireOrderIfPendingTx(client, orderId) {
  const { rows } = await client.query(
    `UPDATE orders SET status = 'EXPIRED', updated_at = now()
     WHERE id = $1 AND status = 'PENDING_PAYMENT' RETURNING *`,
    [orderId],
  );
  return rows[0] ?? null;
}

export async function findOrderById(id) {
  const { rows } = await query('SELECT * FROM orders WHERE id = $1', [id]);
  return rows[0] ?? null;
}

export async function findOrderByIdTx(client, id) {
  const { rows } = await client.query('SELECT * FROM orders WHERE id = $1', [id]);
  return rows[0] ?? null;
}

// Admin order directory (plan §5 /orders, /orders/:id) — every order, not
// scoped to a single customer.
export async function findAllOrders({ status, page = 1, limit = 20 } = {}) {
  const clauses = [];
  const params = [];
  if (status) {
    params.push(status);
    clauses.push(`status = $${params.length}`);
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const offset = (page - 1) * limit;
  const listParams = [...params, limit, offset];

  const { rows } = await query(
    `SELECT * FROM orders ${where}
     ORDER BY created_at DESC
     LIMIT $${listParams.length - 1} OFFSET $${listParams.length}`,
    listParams,
  );
  const {
    rows: [{ count }],
  } = await query(`SELECT COUNT(*)::int AS count FROM orders ${where}`, params);

  return { items: rows, total: count };
}

export async function findOrdersByUser(userId, { status, page = 1, limit = 10 } = {}) {
  const clauses = ['user_id = $1'];
  const params = [userId];
  if (status) {
    params.push(status);
    clauses.push(`status = $${params.length}`);
  }
  const where = `WHERE ${clauses.join(' AND ')}`;
  const offset = (page - 1) * limit;
  const listParams = [...params, limit, offset];

  const { rows } = await query(
    `SELECT * FROM orders ${where}
     ORDER BY created_at DESC
     LIMIT $${listParams.length - 1} OFFSET $${listParams.length}`,
    listParams,
  );
  const {
    rows: [{ count }],
  } = await query(`SELECT COUNT(*)::int AS count FROM orders ${where}`, params);

  return { items: rows, total: count };
}

export async function findOrderItems(orderId) {
  const { rows } = await query(
    'SELECT * FROM order_items WHERE order_id = $1 ORDER BY created_at',
    [orderId],
  );
  return rows;
}

export async function findOrderItemById(id) {
  const { rows } = await query('SELECT * FROM order_items WHERE id = $1', [id]);
  return rows[0] ?? null;
}

export async function findOrderStatusHistory(orderId) {
  const { rows } = await query(
    'SELECT * FROM order_status_history WHERE order_id = $1 ORDER BY created_at',
    [orderId],
  );
  return rows;
}
