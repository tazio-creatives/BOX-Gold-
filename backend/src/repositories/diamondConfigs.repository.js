import { query } from '../config/db.js';

export async function listDiamondConfigs({ activeOnly = false } = {}) {
  const where = activeOnly ? 'WHERE is_active = true' : '';
  const { rows } = await query(
    `SELECT id, name, rate_per_carat, is_active, created_at, updated_at
     FROM diamond_configs ${where} ORDER BY created_at DESC`,
  );
  return rows;
}

export async function findDiamondConfigById(id) {
  const { rows } = await query(
    `SELECT id, name, rate_per_carat, is_active, created_at, updated_at
     FROM diamond_configs WHERE id = $1`,
    [id],
  );
  return rows[0] ?? null;
}

// Batch lookup for name-resolving a cart/order's set of selected diamond
// tiers in one round trip (mirrors findProductSizesByIds).
export async function findDiamondConfigsByIds(ids) {
  if (ids.length === 0) return [];
  const { rows } = await query(
    `SELECT id, name, rate_per_carat, is_active, created_at, updated_at
     FROM diamond_configs WHERE id = ANY($1)`,
    [ids],
  );
  return rows;
}

export async function createDiamondConfig({ name, ratePerCent, isActive = true }) {
  const { rows } = await query(
    `INSERT INTO diamond_configs (name, rate_per_carat, is_active)
     VALUES ($1, $2, $3)
     RETURNING id, name, rate_per_carat, is_active, created_at, updated_at`,
    [name, ratePerCent, isActive],
  );
  return rows[0];
}

export async function updateDiamondConfig(id, { name, ratePerCent, isActive }) {
  const { rows } = await query(
    `UPDATE diamond_configs
     SET name = COALESCE($2, name),
         rate_per_carat = COALESCE($3, rate_per_carat),
         is_active = COALESCE($4, is_active),
         updated_at = now()
     WHERE id = $1
     RETURNING id, name, rate_per_carat, is_active, created_at, updated_at`,
    [id, name ?? null, ratePerCent ?? null, isActive ?? null],
  );
  return rows[0] ?? null;
}

export async function deleteDiamondConfig(id) {
  await query('DELETE FROM diamond_configs WHERE id = $1', [id]);
}
