import { query } from '../config/db.js';

export async function findCartByOwner({ userId, guestSessionId }) {
  if (userId) {
    const { rows } = await query('SELECT * FROM carts WHERE user_id = $1', [userId]);
    return rows[0] ?? null;
  }
  const { rows } = await query('SELECT * FROM carts WHERE guest_session_id = $1', [guestSessionId]);
  return rows[0] ?? null;
}

export async function findCartByOwnerTx(client, { userId, guestSessionId }) {
  if (userId) {
    const { rows } = await client.query('SELECT * FROM carts WHERE user_id = $1', [userId]);
    return rows[0] ?? null;
  }
  const { rows } = await client.query('SELECT * FROM carts WHERE guest_session_id = $1', [guestSessionId]);
  return rows[0] ?? null;
}

// Called once payment is confirmed (paymentService.confirmPayment). Deletes
// only the cart_items rows matching this order's own line items — NOT a
// blanket "empty the cart" — because checkout's `items` payload is explicit
// rather than read from the cart server-side (see checkout.validators.js),
// which is exactly what lets "Buy Now" reuse this same endpoint without its
// single item ever having touched cart_items. A wholesale DELETE here would
// wipe unrelated items a Buy Now shopper still has sitting in their real
// cart; joining against this order's product_id + variant instead means a
// Buy Now purchase naturally matches zero rows and leaves the cart alone.
//
// gold_color/purity/diamond_config_id use "cart value unset, or matches" —
// not a strict equals — because checkoutService.computeVariantPricing()
// defaults each of those three (never product_size_id) to the product's own
// value when the request didn't specify one, so a cart line added with no
// explicit variant legitimately ends up with a "more specific" order_items
// row than what's sitting in cart_items for the exact same line.
export async function clearOrderedItemsFromCartTx(client, cartId, orderId) {
  await client.query(
    `DELETE FROM cart_items ci
     USING order_items oi
     WHERE oi.order_id = $2
       AND ci.cart_id = $1
       AND ci.product_id = oi.product_id
       AND ci.product_size_id IS NOT DISTINCT FROM oi.product_size_id
       AND (ci.gold_color IS NULL OR ci.gold_color = oi.gold_color)
       AND (ci.purity IS NULL OR ci.purity = oi.purity)
       AND (ci.diamond_config_id IS NULL OR ci.diamond_config_id = oi.diamond_config_id)`,
    [cartId, orderId],
  );
}

export async function createCart({ userId, guestSessionId }) {
  const { rows } = await query(
    `INSERT INTO carts (user_id, guest_session_id) VALUES ($1, $2) RETURNING *`,
    [userId ?? null, userId ? null : guestSessionId],
  );
  return rows[0];
}

export async function findCartItems(cartId) {
  const { rows } = await query(
    `SELECT id, product_id, product_size_id, gold_color, purity, diamond_config_id, quantity, created_at
     FROM cart_items WHERE cart_id = $1 ORDER BY created_at`,
    [cartId],
  );
  return rows;
}

// A cart line's real identity is (product, size, gold color, purity,
// diamond quality) — four independently-nullable axes. cart_items_line_
// unique_idx (see 20260815020000_product_variant_options.js) is a single
// COALESCE-normalized index across all of them, so one upsert/match query
// works uniformly instead of branching per axis's nullability.
export async function upsertCartItemIncrement(cartId, productId, variant, quantity) {
  const { sizeId = null, goldColor = null, purity = null, diamondConfigId = null } = variant ?? {};
  const { rows } = await query(
    `INSERT INTO cart_items (cart_id, product_id, product_size_id, gold_color, purity, diamond_config_id, quantity)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (cart_id, product_id, COALESCE(product_size_id::text, ''), COALESCE(gold_color, ''), COALESCE(purity, ''), COALESCE(diamond_config_id::text, ''))
       DO UPDATE SET quantity = cart_items.quantity + EXCLUDED.quantity
     RETURNING *`,
    [cartId, productId, sizeId, goldColor, purity, diamondConfigId, quantity],
  );
  return rows[0];
}

export async function setCartItemQuantity(cartId, productId, variant, quantity) {
  const { sizeId = null, goldColor = null, purity = null, diamondConfigId = null } = variant ?? {};
  const { rows } = await query(
    `UPDATE cart_items SET quantity = $6
     WHERE cart_id = $1 AND product_id = $2
       AND COALESCE(product_size_id::text, '') = COALESCE($3::text, '')
       AND COALESCE(gold_color, '') = COALESCE($4, '')
       AND COALESCE(purity, '') = COALESCE($5, '')
       AND COALESCE(diamond_config_id::text, '') = COALESCE($7::text, '')
     RETURNING *`,
    [cartId, productId, sizeId, goldColor, purity, quantity, diamondConfigId],
  );
  return rows[0] ?? null;
}

export async function removeCartItem(cartId, productId, variant) {
  const { sizeId = null, goldColor = null, purity = null, diamondConfigId = null } = variant ?? {};
  await query(
    `DELETE FROM cart_items
     WHERE cart_id = $1 AND product_id = $2
       AND COALESCE(product_size_id::text, '') = COALESCE($3::text, '')
       AND COALESCE(gold_color, '') = COALESCE($4, '')
       AND COALESCE(purity, '') = COALESCE($5, '')
       AND COALESCE(diamond_config_id::text, '') = COALESCE($6::text, '')`,
    [cartId, productId, sizeId, goldColor, purity, diamondConfigId],
  );
}

// Login-time reassignment (plan §11): a guest who never had an account yet
// just has their existing cart handed to the new user_id — no merge needed.
export async function reassignCartOwner(cartId, userId) {
  await query('UPDATE carts SET user_id = $2, guest_session_id = NULL WHERE id = $1', [
    cartId,
    userId,
  ]);
}

// Both carts already exist (returning customer with items left in a guest
// session) — dedupe by the same (product, size, color, purity, diamond)
// line identity as upsertCartItemIncrement, quantities add together, guest
// cart dropped once merged.
export async function mergeGuestCartIntoUserCart(guestCartId, userCartId) {
  await query(
    `INSERT INTO cart_items (cart_id, product_id, product_size_id, gold_color, purity, diamond_config_id, quantity)
     SELECT $2, product_id, product_size_id, gold_color, purity, diamond_config_id, quantity
     FROM cart_items WHERE cart_id = $1
     ON CONFLICT (cart_id, product_id, COALESCE(product_size_id::text, ''), COALESCE(gold_color, ''), COALESCE(purity, ''), COALESCE(diamond_config_id::text, ''))
       DO UPDATE SET quantity = cart_items.quantity + EXCLUDED.quantity`,
    [guestCartId, userCartId],
  );
  await query('DELETE FROM carts WHERE id = $1', [guestCartId]);
}
