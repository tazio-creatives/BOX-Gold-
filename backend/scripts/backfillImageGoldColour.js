// One-off: labels existing product photos with gold_colour/shot_type (see
// migration 20261024000000_product_image_gold_colour.js) and snapshots the
// photo on order items placed before checkout started doing it.
//
// How a photo's colour is known: AI Studio's import wrote the photo's 9
// product_images rows and flipped its ai_studio_assets row to imported=true
// in ONE transaction, so the photo's created_at equals the asset's
// updated_at exactly — and the asset_type (e.g. RING_ROSE_FRONT) gives the
// colour and shot. Size guides are always ANY/SIZE_GUIDE. Anything else
// (manual uploads, unmatched photos) is left as ANY/OTHER and listed for an
// admin to label in the product gallery.
//
//   node scripts/backfillImageGoldColour.js [--out=DIR]
//       Dry run (default). Read-only transaction; writes a report to DIR.
//   node scripts/backfillImageGoldColour.js --apply [--out=DIR]
//       Applies the labels — only to rows still at the ANY/OTHER defaults, so
//       labels an admin already set are never overwritten — then snapshots
//       order items with no image. Writes a change log for --restore.
//   node scripts/backfillImageGoldColour.js --restore=CHANGE_LOG.json
//       Puts back exactly the values recorded in a change log.
import fs from 'node:fs';
import path from 'node:path';
import { pool } from '../src/config/db.js';
import { imageLabelsForAssetType } from '../src/services/aiStudioService.js';
import { resolveImageForColour } from '../src/services/productImageResolver.js';

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const restoreArg = args.find((a) => a.startsWith('--restore='));
const outDir = args.find((a) => a.startsWith('--out='))?.split('=')[1] ?? process.cwd();
const stamp = new Date().toISOString().replace(/[:.]/g, '-');

const NON_CATALOGUE = new Set(['MODEL', 'SIZE_GUIDE', 'OTHER']);

// Photos on published products with no matching AI Studio record, labelled
// by eye (reviewed 24 Oct 2026). Keyed by slug + gallery position AND the
// photo's file id, so a label can never land on a different photo if the
// gallery changed since.
const MANUAL_LABELS = [
  { slug: 'bellella-diamond-ring', sortOrder: 0, fileId: '17e1be19-4944-4f80-bde1-fc1ccdd8c837', goldColour: 'YELLOW', shotType: 'FRONT' },
  { slug: 'bellella-diamond-ring', sortOrder: 1, fileId: '28dd875b-c988-471f-b20a-41ab4fa8b504', goldColour: 'YELLOW', shotType: 'SIDE' },
  { slug: 'bellella-diamond-ring', sortOrder: 2, fileId: 'd2f873a5-f0d3-4115-9fa9-2a41ed17ca92', goldColour: 'ROSE', shotType: 'FRONT' },
  { slug: 'bellella-diamond-ring', sortOrder: 3, fileId: '701337d5-80d7-488b-ad29-bfe8dbf7abd5', goldColour: 'ROSE', shotType: 'SIDE' },
  { slug: 'bellella-diamond-ring', sortOrder: 4, fileId: '5d37f801-5f35-4f7b-b32d-18ede42048c7', goldColour: 'YELLOW', shotType: 'MODEL' },
  { slug: 'bellella-diamond-ring', sortOrder: 5, fileId: 'd62425db-d164-4e70-8b54-ad5ea96b7a9c', goldColour: 'ROSE', shotType: 'MODEL' },
  { slug: 'stellella-diamond-ring', sortOrder: 0, fileId: '75c5b0a3-8da8-434d-8d7e-63bd338eb32a', goldColour: 'YELLOW', shotType: 'FRONT' },
];

function manualLabelFor(group) {
  const entry = MANUAL_LABELS.find(
    (m) => m.slug === group.slug && m.sortOrder === group.sort_order && group.thumb_url?.includes(`/${m.fileId}-`),
  );
  return entry ? { goldColour: entry.goldColour, shotType: entry.shotType } : null;
}

// --- plan (read-only) -------------------------------------------------------

async function loadPlan(client) {
  const { rows: groups } = await client.query(`
    WITH g AS (
      SELECT product_id, sort_order, type,
             MIN(created_at) AS created_at, MAX(created_at) AS created_at_max,
             COUNT(*)::int AS row_count, BOOL_OR(is_primary) AS is_primary,
             MAX(url) FILTER (WHERE variant = 'small' AND format = 'webp') AS thumb_url
      FROM product_images
      GROUP BY product_id, sort_order, type
    )
    SELECT g.*, p.slug, p.name, p.status, m.asset_type, m.generate_rose_gold, m.matches
    FROM g
    JOIN products p ON p.id = g.product_id
    LEFT JOIN LATERAL (
      SELECT MAX(a.asset_type) AS asset_type, BOOL_OR(j.generate_rose_gold) AS generate_rose_gold,
             COUNT(*)::int AS matches
      FROM ai_studio_assets a
      JOIN ai_studio_jobs j ON j.id = a.job_id
      WHERE j.product_id = g.product_id AND a.imported AND a.updated_at = g.created_at
    ) m ON g.type = 'AI_GENERATED'
    ORDER BY p.slug, g.sort_order`);

  const plan = groups.map((g) => {
    let labels = null;
    let reason;
    if (g.type === 'PRODUCT_SIZE') {
      labels = { goldColour: 'ANY', shotType: 'SIZE_GUIDE' };
      reason = 'size guide';
    } else if (g.type === 'AI_GENERATED' && g.matches === 1 && g.created_at.getTime() === g.created_at_max.getTime()) {
      labels = imageLabelsForAssetType(g.asset_type, g.generate_rose_gold);
      reason = `AI Studio ${g.asset_type}`;
    } else if (manualLabelFor(g)) {
      labels = manualLabelFor(g);
      reason = 'manual label (reviewed)';
    } else if (g.type === 'AI_GENERATED') {
      reason = g.matches > 1 ? 'ambiguous AI Studio match' : 'no AI Studio record matches';
    } else {
      reason = 'manual upload';
    }
    return { ...g, labels, reason };
  });

  const { rows: offered } = await client.query(`
    SELECT p.id AS product_id, p.slug, p.name,
           COALESCE(
             (SELECT array_agg(DISTINCT av.value ORDER BY av.value)
              FROM product_variants pv
              JOIN variant_attribute_values vav ON vav.variant_id = pv.id
              JOIN attribute_values av ON av.id = vav.attribute_value_id
              JOIN attributes a ON a.id = av.attribute_id AND a.code = 'gold_color'
              WHERE pv.product_id = p.id AND pv.is_available),
             CASE WHEN p.gold_color IS NOT NULL THEN ARRAY[p.gold_color] ELSE ARRAY[]::text[] END
           ) AS colours
    FROM products p
    WHERE p.status = 'PUBLISHED'
    ORDER BY p.slug`);

  const { rows: orderItems } = await client.query(`
    SELECT oi.id, oi.product_id, o.order_number,
           (SELECT e->>'label' FROM jsonb_array_elements(oi.variant_attributes_snapshot) e
            WHERE e->>'attributeCode' = 'gold_color' LIMIT 1) AS gold_colour
    FROM order_items oi JOIN orders o ON o.id = oi.order_id
    ${await hasColumn(client, 'order_items', 'image_url') ? 'WHERE oi.image_url IS NULL' : ''}
    ORDER BY o.order_number`);

  return { plan, offered, orderItems };
}

async function hasColumn(client, table, column) {
  const { rows } = await client.query(
    'SELECT 1 FROM information_schema.columns WHERE table_name = $1 AND column_name = $2',
    [table, column],
  );
  return rows.length > 0;
}

// Photos per product as the resolver would see them AFTER the backfill.
async function plannedImageRows(client, plan, productIds) {
  const { rows } = await client.query(
    `SELECT product_id, sort_order, type, variant, format, url, is_primary
     FROM product_images WHERE product_id = ANY($1) AND variant IN ('small', 'large', 'original')`,
    [productIds],
  );
  const labelsByGroup = new Map(plan.map((g) => [`${g.product_id}:${g.sort_order}`, g.labels]));
  const byProduct = new Map();
  for (const row of rows) {
    const labels = labelsByGroup.get(`${row.product_id}:${row.sort_order}`) ?? { goldColour: 'ANY', shotType: 'OTHER' };
    const labelled = { ...row, gold_colour: labels.goldColour, shot_type: labels.shotType };
    if (!byProduct.has(row.product_id)) byProduct.set(row.product_id, []);
    byProduct.get(row.product_id).push(labelled);
  }
  return byProduct;
}

function buildReport(plan, offered, orderItems, imagesByProduct) {
  const labelled = plan.filter((g) => g.labels);
  const unmatched = plan.filter((g) => !g.labels);
  const countBy = (list, key) =>
    list.reduce((acc, item) => ((acc[key(item)] = (acc[key(item)] ?? 0) + 1), acc), {});

  // A product "has" colour C when some catalogue photo (not model/size/other)
  // will be labelled C; otherwise the cart falls back to the featured photo.
  const catalogueColours = new Map();
  for (const g of labelled) {
    if (NON_CATALOGUE.has(g.labels.shotType)) continue;
    if (!catalogueColours.has(g.product_id)) catalogueColours.set(g.product_id, new Map());
    const shots = catalogueColours.get(g.product_id);
    shots.set(g.labels.goldColour, [...(shots.get(g.labels.goldColour) ?? []), g.labels.shotType]);
  }
  const missing = [];
  for (const p of offered) {
    const have = catalogueColours.get(p.product_id) ?? new Map();
    for (const colour of p.colours) {
      const shots = have.get(colour);
      if (!shots) missing.push({ slug: p.slug, name: p.name, colour, problem: 'no photo of this colour' });
      else if (!shots.includes('FRONT')) missing.push({ slug: p.slug, name: p.name, colour, problem: 'no FRONT photo (another view will be used)' });
    }
  }

  const orderSnapshots = orderItems.map((oi) => {
    const image = resolveImageForColour(imagesByProduct.get(oi.product_id), oi.gold_colour);
    return { orderItemId: oi.id, orderNumber: oi.order_number, goldColour: oi.gold_colour, imageUrl: image?.smallUrl ?? null, imageLargeUrl: image?.largeUrl ?? null };
  });

  return {
    generatedAt: new Date().toISOString(),
    totals: {
      photoGroups: plan.length,
      willBeLabelled: labelled.length,
      leftUnlabelled: unmatched.length,
      byType: countBy(plan, (g) => g.type),
      labelledBySource: countBy(labelled, (g) =>
        g.type === 'PRODUCT_SIZE' ? 'size guide' : g.reason === 'manual label (reviewed)' ? 'manual label' : 'AI Studio match',
      ),
      labelsPlanned: countBy(labelled, (g) => `${g.labels.goldColour} ${g.labels.shotType}`),
      groupsWithout9Rows: plan.filter((g) => g.row_count !== 9).length,
      publishedProducts: offered.length,
      productColourGaps: missing.filter((m) => m.problem === 'no photo of this colour').length,
      productColourNoFront: missing.filter((m) => m.problem !== 'no photo of this colour').length,
      orderItemsToSnapshot: orderSnapshots.length,
    },
    unmatched: unmatched.map((g) => ({
      slug: g.slug,
      name: g.name,
      status: g.status,
      sortOrder: g.sort_order,
      type: g.type,
      reason: g.reason,
      isPrimary: g.is_primary,
      thumbUrl: g.thumb_url,
    })),
    missingColour: missing,
    orderSnapshots,
  };
}

function writeReport(report, prefix) {
  fs.mkdirSync(outDir, { recursive: true });
  const jsonPath = path.join(outDir, `${prefix}-${stamp}.json`);
  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 1));
  const t = report.totals;
  const lines = [
    `Gold-colour image backfill — ${prefix} — ${report.generatedAt}`,
    '',
    `Photo groups: ${t.photoGroups} (${Object.entries(t.byType).map(([k, v]) => `${k} ${v}`).join(', ')})`,
    `Will be labelled: ${t.willBeLabelled} (${Object.entries(t.labelledBySource).map(([k, v]) => `${k} ${v}`).join(', ')})`,
    `Left unlabelled (ANY/OTHER, to label in admin): ${t.leftUnlabelled}`,
    `Groups without exactly 9 rows: ${t.groupsWithout9Rows}`,
    '',
    'Labels planned:',
    ...Object.entries(t.labelsPlanned).sort().map(([k, v]) => `  ${k.padEnd(18)} ${v}`),
    '',
    `Published products: ${t.publishedProducts}`,
    `  colour sold but no photo of it: ${t.productColourGaps}`,
    `  colour has photos but no FRONT: ${t.productColourNoFront}`,
    `Order items to snapshot: ${t.orderItemsToSnapshot}`,
    '',
    'Unmatched photos:',
    ...report.unmatched.map((u) => `  ${u.slug} #${u.sortOrder} ${u.type} — ${u.reason}${u.isPrimary ? ' (featured)' : ''}`),
  ];
  const txtPath = path.join(outDir, `${prefix}-${stamp}.txt`);
  fs.writeFileSync(txtPath, `${lines.join('\n')}\n`);
  const csv = ['slug,name,colour,problem', ...report.missingColour.map((m) => [m.slug, `"${m.name.replace(/"/g, '""')}"`, m.colour, m.problem].join(','))];
  const csvPath = path.join(outDir, `${prefix}-missing-colour-${stamp}.csv`);
  fs.writeFileSync(csvPath, `${csv.join('\n')}\n`);
  return { jsonPath, txtPath, csvPath };
}

// --- restore ----------------------------------------------------------------

if (restoreArg) {
  const log = JSON.parse(fs.readFileSync(restoreArg.split('=')[1], 'utf8'));
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const g of log.groups) {
      await client.query(
        'UPDATE product_images SET gold_colour = $3, shot_type = $4 WHERE product_id = $1 AND sort_order = $2',
        [g.productId, g.sortOrder, g.before.goldColour, g.before.shotType],
      );
    }
    for (const oi of log.orderItems) {
      await client.query('UPDATE order_items SET image_url = NULL, image_large_url = NULL WHERE id = $1', [oi.orderItemId]);
    }
    await client.query('COMMIT');
    console.log(`Restored ${log.groups.length} photo groups and ${log.orderItems.length} order items.`);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
  process.exit(0);
}

// --- dry run / apply ----------------------------------------------------------

const client = await pool.connect();
try {
  await client.query(apply ? 'BEGIN' : 'BEGIN READ ONLY');
  if (apply && !(await hasColumn(client, 'product_images', 'gold_colour'))) {
    throw new Error('Run the 20261024000000_product_image_gold_colour migration first.');
  }
  const { plan, offered, orderItems } = await loadPlan(client);
  const imagesByProduct = await plannedImageRows(client, plan, [
    ...new Set([...offered.map((p) => p.product_id), ...orderItems.map((oi) => oi.product_id)]),
  ]);
  const report = buildReport(plan, offered, orderItems, imagesByProduct);

  if (!apply) {
    await client.query('ROLLBACK');
    const paths = writeReport(report, 'image-gold-colour-dry-run');
    console.log(fs.readFileSync(paths.txtPath, 'utf8').split('\nUnmatched photos:')[0]);
    console.log(`Dry run — nothing changed.\nReport: ${paths.txtPath}\nFull data: ${paths.jsonPath}\nMissing colours: ${paths.csvPath}`);
  } else {
    const log = { createdAt: new Date().toISOString(), groups: [], orderItems: [] };
    for (const g of plan.filter((x) => x.labels)) {
      // Only rows still at the defaults, and only if the photo is unchanged
      // since the plan was read (same row count, same created_at).
      const { rowCount } = await client.query(
        `UPDATE product_images SET gold_colour = $3, shot_type = $4
         WHERE product_id = $1 AND sort_order = $2 AND created_at = $5
           AND gold_colour = 'ANY' AND shot_type = 'OTHER'`,
        [g.product_id, g.sort_order, g.labels.goldColour, g.labels.shotType, g.created_at],
      );
      // All of a photo's rows or none (none = an admin already labelled it).
      if (rowCount !== 0 && rowCount !== g.row_count) {
        throw new Error(`${g.slug} #${g.sort_order}: ${rowCount} of ${g.row_count} rows matched — aborting, nothing applied`);
      }
      if (rowCount > 0) {
        log.groups.push({ productId: g.product_id, sortOrder: g.sort_order, rows: rowCount, before: { goldColour: 'ANY', shotType: 'OTHER' }, after: g.labels });
      }
    }
    for (const snap of report.orderSnapshots) {
      if (!snap.imageUrl) continue;
      const { rowCount } = await client.query(
        'UPDATE order_items SET image_url = $2, image_large_url = $3 WHERE id = $1 AND image_url IS NULL',
        [snap.orderItemId, snap.imageUrl, snap.imageLargeUrl],
      );
      if (rowCount > 0) log.orderItems.push(snap);
    }
    await client.query('COMMIT');
    fs.mkdirSync(outDir, { recursive: true });
    const logPath = path.join(outDir, `image-gold-colour-change-log-${stamp}.json`);
    fs.writeFileSync(logPath, JSON.stringify(log, null, 1));
    const paths = writeReport(report, 'image-gold-colour-applied');
    console.log(`Applied: ${log.groups.length} photo groups labelled, ${log.orderItems.length} order items snapshotted.`);
    console.log(`Change log (for --restore): ${logPath}\nReport: ${paths.txtPath}`);
  }
} catch (err) {
  await client.query('ROLLBACK').catch(() => {});
  console.error(err);
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
