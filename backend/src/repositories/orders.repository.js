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
    `SELECT o.*, items.first_product_name, items.item_count
     FROM orders o
     LEFT JOIN LATERAL (
       SELECT
         (array_agg(product_name ORDER BY created_at))[1] AS first_product_name,
         COUNT(*)::int AS item_count
       FROM order_items
       WHERE order_id = o.id
     ) items ON true
     ${where}
     ORDER BY o.created_at DESC
     LIMIT $${listParams.length - 1} OFFSET $${listParams.length}`,
    listParams,
  );
  const {
    rows: [{ count }],
  } = await query(`SELECT COUNT(*)::int AS count FROM orders ${where}`, params);

  return { items: rows, total: count };
}

// "Active" = still moving toward delivery, not a terminal state. Spend
// excludes orders that never actually resulted in a charge (unpaid/failed/
// expired/cancelled before confirmation) — a single aggregate query rather
// than summing a paginated page, since "Total Spent" must reflect every
// order the customer has ever placed, not just the current page of 10.
const ACTIVE_STATUSES = ['PENDING_PAYMENT', 'CONFIRMED', 'PROCESSING', 'SHIPPED', 'OUT_FOR_DELIVERY', 'RETURN_REQUESTED'];
const UNSPENT_STATUSES = ['PENDING_PAYMENT', 'PAYMENT_FAILED', 'EXPIRED', 'CANCELLED'];

export async function getOrderStatsForUser(userId) {
  const { rows } = await query(
    `SELECT
       COUNT(*)::int AS total_orders,
       COUNT(*) FILTER (WHERE status = ANY($2))::int AS active_orders,
       COALESCE(SUM(total_amount) FILTER (WHERE status != ALL($3)), 0) AS total_spent
     FROM orders WHERE user_id = $1`,
    [userId, ACTIVE_STATUSES, UNSPENT_STATUSES],
  );
  return rows[0];
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

// Batched (not N+1) preview data for the account "My Orders" list card —
// item count, a representative product name/thumbnail, and the timestamps
// the order-progress stepper needs. Three queries total regardless of how
// many orders are on the page, since the page itself is already limited to
// a handful of rows.
export async function findOrderListExtras(orderIds) {
  if (orderIds.length === 0) {
    return { itemCounts: new Map(), previews: new Map(), milestones: new Map() };
  }

  const [{ rows: countRows }, { rows: previewRows }, { rows: milestoneRows }] = await Promise.all([
    query('SELECT order_id, COUNT(*)::int AS item_count FROM order_items WHERE order_id = ANY($1) GROUP BY order_id', [
      orderIds,
    ]),
    query(
      `SELECT DISTINCT ON (oi.order_id) oi.order_id, oi.product_name, pi.url AS preview_image_url
       FROM order_items oi
       LEFT JOIN LATERAL (
         SELECT url FROM product_images
         WHERE product_id = oi.product_id AND is_primary = true AND variant = 'small'
         LIMIT 1
       ) pi ON true
       WHERE oi.order_id = ANY($1)
       ORDER BY oi.order_id, oi.created_at ASC`,
      [orderIds],
    ),
    query(
      `SELECT order_id, status, MIN(created_at) AS at
       FROM order_status_history
       WHERE order_id = ANY($1) AND status IN ('CONFIRMED', 'SHIPPED', 'OUT_FOR_DELIVERY', 'DELIVERED')
       GROUP BY order_id, status`,
      [orderIds],
    ),
  ]);

  const itemCounts = new Map(countRows.map((r) => [r.order_id, r.item_count]));
  const previews = new Map(
    previewRows.map((r) => [r.order_id, { productName: r.product_name, imageUrl: r.preview_image_url }]),
  );
  const milestones = new Map();
  for (const row of milestoneRows) {
    const entry = milestones.get(row.order_id) ?? {};
    entry[row.status] = row.at;
    milestones.set(row.order_id, entry);
  }

  return { itemCounts, previews, milestones };
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
