// One-off clean-up of product slugs that make poor URLs:
//   - number-only slugs typed in by hand ("/pendants/666")
//   - accented names mangled by the old slugify ("María" -> "mar-a")
// Each product gets slugify(name) (with -2, -3… if that's taken) and its old
// slug is recorded in product_slug_redirects, so the old URL 301s to the
// new one (web/server/index.js).
//
// Dry run by default — SELECTs only, prints the planned changes as CSV.
// Usage: node backend/scripts/fixProductSlugs.js > slug-plan.csv
//        node backend/scripts/fixProductSlugs.js --apply

import { query, pool, withTransaction } from '../src/config/db.js';
import { slugify } from '../src/utils/slug.js';
import { recordProductSlugChange } from '../src/repositories/products.repository.js';

const apply = process.argv.includes('--apply');

// The slugify this codebase used before accents were handled — a slug equal
// to this (and different from the new one) is an accent-mangled slug.
function legacySlugify(input) {
  return String(input)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function csvCell(value) {
  if (value == null) return '';
  const s = String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const { rows: products } = await query(
  `SELECT p.id, p.name, p.slug, p.status, cat.slug AS category_slug
   FROM products p LEFT JOIN categories cat ON cat.id = p.category_id
   ORDER BY p.created_at`,
);

const taken = new Set(products.map((p) => p.slug));
const plan = [];
for (const p of products) {
  const numeric = /^\d+$/.test(p.slug);
  const accentMangled = p.slug === legacySlugify(p.name) && slugify(p.name) !== p.slug;
  if (!numeric && !accentMangled) continue;

  const base = slugify(p.name);
  // A product *named* "119" has nothing better to offer — rename it in
  // admin first; "119-2" would be no improvement.
  if (!base || /^\d+$/.test(base)) continue;
  let candidate = base;
  for (let n = 2; taken.has(candidate); n += 1) candidate = `${base}-${n}`;
  taken.add(candidate);
  plan.push({ ...p, newSlug: candidate, reason: numeric ? 'number-only' : 'accents' });
}

console.log('reason,status,name,old_url,new_url');
for (const p of plan) {
  const prefix = p.category_slug ? `/${p.category_slug}/` : '/(no category)/';
  console.log(
    [p.reason, p.status, p.name, `${prefix}${p.slug}`, `${prefix}${p.newSlug}`].map(csvCell).join(','),
  );
}
console.error(`${plan.length} product slug(s) ${apply ? 'to update' : 'would change (dry run — nothing written)'}`);

if (apply && plan.length > 0) {
  await withTransaction(async () => {
    for (const p of plan) {
      await query('UPDATE products SET slug = $2, updated_at = now() WHERE id = $1', [p.id, p.newSlug]);
      await recordProductSlugChange(p.id, p.slug, p.newSlug);
    }
    // Cached storefront HTML still links the old URLs.
    await query('DELETE FROM page_cache');
  });
  console.error('Applied. Old URLs now 301 to the new ones.');
}

await pool.end();
