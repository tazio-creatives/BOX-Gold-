import { query } from '../config/db.js';

export async function listAllSections() {
  const { rows } = await query(
    `SELECT id, type, heading, is_enabled, sort_order FROM homepage_sections ORDER BY sort_order`,
  );
  return rows;
}

export async function findSectionById(id) {
  const { rows } = await query('SELECT * FROM homepage_sections WHERE id = $1', [id]);
  return rows[0] ?? null;
}

export async function findMaxSectionSortOrder() {
  const { rows } = await query('SELECT COALESCE(MAX(sort_order), -1) AS max FROM homepage_sections');
  return rows[0].max;
}

export async function insertSection({ type, heading, isEnabled, sortOrder }) {
  const { rows } = await query(
    `INSERT INTO homepage_sections (type, heading, is_enabled, sort_order)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [type, heading ?? null, isEnabled ?? true, sortOrder],
  );
  return rows[0];
}

const SECTION_FIELD_MAP = { heading: 'heading', isEnabled: 'is_enabled', sortOrder: 'sort_order' };

export async function updateSection(id, fields) {
  const values = [id];
  const setClauses = [];
  for (const [key, column] of Object.entries(SECTION_FIELD_MAP)) {
    if (Object.hasOwn(fields, key)) {
      values.push(fields[key]);
      setClauses.push(`${column} = $${values.length}`);
    }
  }
  if (setClauses.length === 0) return findSectionById(id);
  setClauses.push('updated_at = now()');
  const { rows } = await query(
    `UPDATE homepage_sections SET ${setClauses.join(', ')} WHERE id = $1 RETURNING *`,
    values,
  );
  return rows[0] ?? null;
}

export async function deleteSection(id) {
  await query('DELETE FROM homepage_sections WHERE id = $1', [id]);
}

export async function updateSectionSortOrder(oldSortOrder, newSortOrder) {
  await query('UPDATE homepage_sections SET sort_order = $2 WHERE sort_order = $1', [
    oldSortOrder,
    newSortOrder,
  ]);
}

export async function findItemsBySectionId(sectionId) {
  const { rows } = await query(
    'SELECT * FROM homepage_items WHERE section_id = $1 ORDER BY sort_order',
    [sectionId],
  );
  return rows;
}

export async function findItemById(id) {
  const { rows } = await query('SELECT * FROM homepage_items WHERE id = $1', [id]);
  return rows[0] ?? null;
}

export async function findMaxItemSortOrder(sectionId) {
  const { rows } = await query(
    'SELECT COALESCE(MAX(sort_order), -1) AS max FROM homepage_items WHERE section_id = $1',
    [sectionId],
  );
  return rows[0].max;
}

export async function insertItem({
  sectionId,
  imageUrl,
  imageUrlMobile,
  heading,
  subheading,
  ctaLabel,
  ctaUrl,
  categoryId,
  collectionId,
  productId,
  sortOrder,
}) {
  const { rows } = await query(
    `INSERT INTO homepage_items
       (section_id, image_url, image_url_mobile, heading, subheading, cta_label, cta_url, category_id, collection_id, product_id, sort_order)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
    [
      sectionId,
      imageUrl ?? null,
      imageUrlMobile ?? null,
      heading ?? null,
      subheading ?? null,
      ctaLabel ?? null,
      ctaUrl ?? null,
      categoryId ?? null,
      collectionId ?? null,
      productId ?? null,
      sortOrder,
    ],
  );
  return rows[0];
}

const ITEM_FIELD_MAP = {
  imageUrl: 'image_url',
  imageUrlMobile: 'image_url_mobile',
  heading: 'heading',
  subheading: 'subheading',
  ctaLabel: 'cta_label',
  ctaUrl: 'cta_url',
  categoryId: 'category_id',
  collectionId: 'collection_id',
  productId: 'product_id',
  sortOrder: 'sort_order',
};

export async function updateItem(id, fields) {
  const values = [id];
  const setClauses = [];
  for (const [key, column] of Object.entries(ITEM_FIELD_MAP)) {
    if (Object.hasOwn(fields, key)) {
      values.push(fields[key]);
      setClauses.push(`${column} = $${values.length}`);
    }
  }
  if (setClauses.length === 0) return findItemById(id);
  const { rows } = await query(
    `UPDATE homepage_items SET ${setClauses.join(', ')} WHERE id = $1 RETURNING *`,
    values,
  );
  return rows[0] ?? null;
}

export async function deleteItem(id) {
  await query('DELETE FROM homepage_items WHERE id = $1', [id]);
}

export async function updateItemSortOrder(sectionId, oldSortOrder, newSortOrder) {
  await query(
    'UPDATE homepage_items SET sort_order = $3 WHERE section_id = $1 AND sort_order = $2',
    [sectionId, oldSortOrder, newSortOrder],
  );
}
