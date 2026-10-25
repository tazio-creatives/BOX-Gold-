import { query } from '../../src/config/db.js';

// The global 'purity' attribute value for a purity code ('9K', '18K', ...).
// Looked up by code because its id differs per environment (production's is
// not dev's). The data-migration script creates these rows on a real
// install; a fresh test database has none, so a missing one is created here
// — the same shape the product services look up (product_id IS NULL).
export async function globalPurityValueId(code) {
  await query(
    `INSERT INTO attribute_values (attribute_id, product_id, value, label)
     SELECT id, NULL, $1, $1 FROM attributes WHERE code = 'purity'
     ON CONFLICT (attribute_id, value) WHERE product_id IS NULL DO NOTHING`,
    [code],
  );
  const { rows } = await query(
    `SELECT av.id FROM attribute_values av JOIN attributes a ON a.id = av.attribute_id
     WHERE a.code = 'purity' AND av.product_id IS NULL AND av.value = $1`,
    [code],
  );
  if (!rows[0]) throw new Error(`no 'purity' attribute in this database (code ${code})`);
  return rows[0].id;
}
