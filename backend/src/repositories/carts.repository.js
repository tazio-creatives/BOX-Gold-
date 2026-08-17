import { query } from '../config/db.js';

export async function findCartByOwner({ userId, guestSessionId }) {
  if (userId) {
    const { rows } = await query('SELECT * FROM carts WHERE user_id = $1', [userId]);
    return rows[0] ?? null;
  }
  const { rows } = await query('SELECT * FROM carts WHERE guest_session_id = $1', [guestSessionId]);
  return rows[0] ?? null;
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
