import { query } from '../config/db.js';

export async function insertDiamondRate(ratePerCarat, setByAdminId) {
  const { rows } = await query(
    `INSERT INTO diamond_rates (rate_per_carat, set_by_admin_id)
     VALUES ($1, $2)
     RETURNING id, rate_per_carat, set_by_admin_id, created_at`,
    [ratePerCarat, setByAdminId],
  );
  return rows[0];
}

export async function getCurrentDiamondRate() {
  const { rows } = await query(
    `SELECT id, rate_per_carat, set_by_admin_id, created_at
     FROM diamond_rates ORDER BY created_at DESC LIMIT 1`,
  );
  return rows[0] ?? null;
}

export async function listDiamondRateHistory({ page = 1, limit = 50 } = {}) {
  const offset = (page - 1) * limit;
  const { rows } = await query(
    `SELECT id, rate_per_carat, set_by_admin_id, created_at
     FROM diamond_rates ORDER BY created_at DESC LIMIT $1 OFFSET $2`,
    [limit, offset],
  );
  const {
    rows: [{ count }],
  } = await query('SELECT COUNT(*)::int AS count FROM diamond_rates');
  return { items: rows, total: count };
}
