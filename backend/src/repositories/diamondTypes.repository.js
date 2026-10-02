import { query } from '../config/db.js';
import { slugify } from '../utils/slug.js';

export async function listDiamondTypes({ activeOnly = false } = {}) {
  const where = activeOnly ? 'WHERE is_active = true' : '';
  const { rows } = await query(
    `SELECT id, name, slug, is_active, sort_order, created_at, updated_at
     FROM diamond_types ${where} ORDER BY sort_order, name`,
  );
  return rows;
}

export async function findDiamondTypeById(id) {
  const { rows } = await query(
    `SELECT id, name, slug, is_active, sort_order, created_at, updated_at FROM diamond_types WHERE id = $1`,
    [id],
  );
  return rows[0] ?? null;
}

// Batch lookup for resolving a rule's pricing_rule_diamond_types set (or any
// other multi-id lookup) in one round trip — mirrors findDiamondConfigsByIds.
export async function findDiamondTypesByIds(ids) {
  if (ids.length === 0) return [];
  const { rows } = await query(
    `SELECT id, name, slug, is_active, sort_order, created_at, updated_at FROM diamond_types WHERE id = ANY($1)`,
    [ids],
  );
  return rows;
}

export async function findDiamondTypeBySlug(slug) {
  const { rows } = await query(
    `SELECT id, name, slug, is_active, sort_order, created_at, updated_at FROM diamond_types WHERE slug = $1`,
    [slug],
  );
  return rows[0] ?? null;
}

export async function createDiamondType({ name, sortOrder = 0, isActive = true }) {
  const { rows } = await query(
    `INSERT INTO diamond_types (name, slug, sort_order, is_active)
     VALUES ($1, $2, $3, $4)
     RETURNING id, name, slug, is_active, sort_order, created_at, updated_at`,
    [name, slugify(name), sortOrder, isActive],
  );
  return rows[0];
}

export async function updateDiamondType(id, { name, sortOrder, isActive }) {
  const { rows } = await query(
    `UPDATE diamond_types
     SET name = COALESCE($2, name),
         slug = COALESCE($3, slug),
         sort_order = COALESCE($4, sort_order),
         is_active = COALESCE($5, is_active),
         updated_at = now()
     WHERE id = $1
     RETURNING id, name, slug, is_active, sort_order, created_at, updated_at`,
    [id, name ?? null, name ? slugify(name) : null, sortOrder ?? null, isActive ?? null],
  );
  return rows[0] ?? null;
}
