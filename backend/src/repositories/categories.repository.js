import { query } from '../config/db.js';

const ALL_COLUMNS = `id, parent_id, name, slug, description, image_url, is_active, sort_order, created_at, updated_at`;

export async function listAllCategories({ activeOnly = false } = {}) {
  const { rows } = await query(
    `SELECT ${ALL_COLUMNS} FROM categories
     ${activeOnly ? 'WHERE is_active = true' : ''}
     ORDER BY sort_order, name`,
  );
  return rows;
}

export async function searchCategories(term, limit = 5) {
  const { rows } = await query(
    `SELECT ${ALL_COLUMNS} FROM categories
     WHERE is_active = true AND name ILIKE '%' || $1 || '%'
     ORDER BY name LIMIT $2`,
    [term, limit],
  );
  return rows;
}

export async function findCategoryBySlug(slug) {
  const { rows } = await query(`SELECT ${ALL_COLUMNS} FROM categories WHERE slug = $1`, [slug]);
  return rows[0] ?? null;
}

export async function findCategoryById(id) {
  const { rows } = await query(`SELECT ${ALL_COLUMNS} FROM categories WHERE id = $1`, [id]);
  return rows[0] ?? null;
}

// This category's id plus every descendant id, via a recursive CTE — used to
// make a PLP category filter include subcategory products (plan §3: "Rings →
// Diamond Rings → Solitaire Rings").
export async function getCategoryAndDescendantIds(categoryId) {
  const { rows } = await query(
    `WITH RECURSIVE descendants AS (
       SELECT id FROM categories WHERE id = $1
       UNION ALL
       SELECT c.id FROM categories c
       JOIN descendants d ON c.parent_id = d.id
     )
     SELECT id FROM descendants`,
    [categoryId],
  );
  return rows.map((r) => r.id);
}

// True if `candidateAncestorId` is categoryId itself or one of its
// descendants — used to reject a parent_id update that would create a cycle.
export async function isSelfOrDescendant(categoryId, candidateAncestorId) {
  const descendantIds = await getCategoryAndDescendantIds(categoryId);
  return descendantIds.includes(candidateAncestorId);
}

export async function createCategory({ parentId, name, slug, description, imageUrl, isActive, sortOrder }) {
  const { rows } = await query(
    `INSERT INTO categories (parent_id, name, slug, description, image_url, is_active, sort_order)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING ${ALL_COLUMNS}`,
    [parentId ?? null, name, slug, description ?? null, imageUrl ?? null, isActive ?? true, sortOrder ?? 0],
  );
  return rows[0];
}

// Only columns actually present as keys on `fields` are updated — COALESCE
// against undefined-vs-null can't distinguish "not provided" from
// "explicitly cleared" (e.g. clearing parent_id back to top-level), since
// both collapse to SQL NULL once bound as a query parameter.
const CATEGORY_COLUMNS = {
  parentId: 'parent_id',
  name: 'name',
  slug: 'slug',
  description: 'description',
  imageUrl: 'image_url',
  isActive: 'is_active',
  sortOrder: 'sort_order',
};

export async function updateCategory(id, fields) {
  const values = [id];
  const setClauses = [];
  for (const [key, column] of Object.entries(CATEGORY_COLUMNS)) {
    if (Object.hasOwn(fields, key)) {
      values.push(fields[key]);
      setClauses.push(`${column} = $${values.length}`);
    }
  }
  if (setClauses.length === 0) return findCategoryById(id);

  setClauses.push('updated_at = now()');
  const { rows } = await query(
    `UPDATE categories SET ${setClauses.join(', ')} WHERE id = $1 RETURNING ${ALL_COLUMNS}`,
    values,
  );
  return rows[0] ?? null;
}

export async function deleteCategory(id) {
  await query('DELETE FROM categories WHERE id = $1', [id]);
}
