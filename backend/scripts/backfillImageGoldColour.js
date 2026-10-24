// One-off: labels existing product photos with gold_colour/shot_type (see
// migration 20261024000000_product_image_gold_colour.js) and snapshots the
// photo on order items placed before checkout started doing it.
//
// How a photo's colour is known: AI Studio's import wrote the photo's 9
// product_images rows and flipped its ai_studio_assets row to imported=true
// in ONE transaction, so the photo's created_at equals the asset's
// updated_at exactly — and the asset_type (e.g. RING_ROSE_FRONT) gives the
// colour and shot. Size guides are always ANY/SIZE_GUIDE. A few photos on
// published products were labelled by eye (MANUAL_LABELS). Anything else is
// left as ANY/OTHER and listed for an admin to label in the product gallery.
//
// Timestamps stay PostgreSQL text end to end (MIN(created_at)::text, compared
// with $n::timestamptz) — a JavaScript Date only keeps milliseconds, and
// comparing at that precision silently skips almost every photo.
//
//   node scripts/backfillImageGoldColour.js [--out=DIR]
//       Dry run (default). READ ONLY transaction; writes a report to DIR.
//   node scripts/backfillImageGoldColour.js --apply --expect-groups=N --expect-order-items=M [--out=DIR]
//       All-or-nothing: one transaction that re-plans, locks and checks every
//       target row, applies, then verifies the exact counts the reviewed dry
//       run reported. Any difference (including an admin edit since the dry
//       run) rolls everything back — run a new dry run and review it again.
//       The change log is written before COMMIT (as .pending.json) and
//       renamed + verified after it.
//   node scripts/backfillImageGoldColour.js --restore=CHANGE_LOG.json
//       Puts back exactly the values recorded in a change log (atomic).
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { pool } from '../src/config/db.js';
import { imageLabelsForAssetType } from '../src/services/aiStudioService.js';
import { resolveImageForColour } from '../src/services/productImageResolver.js';

const NON_CATALOGUE = new Set(['MODEL', 'SIZE_GUIDE', 'OTHER']);
const ROWS_PER_PHOTO = 9;

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

export class BackfillAbort extends Error {}

// `productIds` narrows every query to those products — used only by the
// tests, so they can run against a shared database. Production runs unscoped.
function scopeClause(productIds, column, params) {
  if (!productIds) return '';
  params.push(productIds);
  return ` AND ${column} = ANY($${params.length})`;
}

async function hasColumn(client, table, column) {
  const { rows } = await client.query(
    'SELECT 1 FROM information_schema.columns WHERE table_name = $1 AND column_name = $2',
    [table, column],
  );
  return rows.length > 0;
}

// --- plan (read-only) -------------------------------------------------------

export async function loadPlan(client, { productIds } = {}) {
  const groupParams = [];
  const { rows: groups } = await client.query(
    `WITH g AS (
       SELECT product_id, sort_order, type,
              MIN(created_at) AS created_at_ts,
              MIN(created_at) = MAX(created_at) AS single_timestamp,
              COUNT(*)::int AS row_count, BOOL_OR(is_primary) AS is_primary,
              MAX(url) FILTER (WHERE variant = 'small' AND format = 'webp') AS thumb_url
       FROM product_images
       WHERE true${scopeClause(productIds, 'product_id', groupParams)}
       GROUP BY product_id, sort_order, type
     )
     SELECT g.product_id, g.sort_order, g.type, g.created_at_ts::text AS created_at, g.single_timestamp,
            g.row_count, g.is_primary, g.thumb_url, p.slug, p.name, p.status,
            m.asset_type, m.generate_rose_gold, m.matches
     FROM g
     JOIN products p ON p.id = g.product_id
     LEFT JOIN LATERAL (
       SELECT MAX(a.asset_type) AS asset_type, BOOL_OR(j.generate_rose_gold) AS generate_rose_gold,
              COUNT(*)::int AS matches
       FROM ai_studio_assets a
       JOIN ai_studio_jobs j ON j.id = a.job_id
       WHERE j.product_id = g.product_id AND a.imported AND a.updated_at = g.created_at_ts
     ) m ON g.type = 'AI_GENERATED'
     ORDER BY p.slug, g.sort_order`,
    groupParams,
  );

  const plan = groups.map((g) => {
    let labels = null;
    let reason;
    if (g.type === 'PRODUCT_SIZE') {
      labels = { goldColour: 'ANY', shotType: 'SIZE_GUIDE' };
      reason = 'size guide';
    } else if (g.type === 'AI_GENERATED' && g.matches === 1 && g.single_timestamp) {
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

  const offeredParams = [];
  const { rows: offered } = await client.query(
    `SELECT p.id AS product_id, p.slug, p.name,
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
     WHERE p.status = 'PUBLISHED'${scopeClause(productIds, 'p.id', offeredParams)}
     ORDER BY p.slug`,
    offeredParams,
  );

  const orderParams = [];
  const snapshotColumns = await hasColumn(client, 'order_items', 'image_url');
  const { rows: orderItems } = await client.query(
    `SELECT oi.id, oi.product_id, o.order_number,
            (SELECT e->>'label' FROM jsonb_array_elements(oi.variant_attributes_snapshot) e
             WHERE e->>'attributeCode' = 'gold_color' LIMIT 1) AS gold_colour
     FROM order_items oi JOIN orders o ON o.id = oi.order_id
     WHERE ${snapshotColumns ? 'oi.image_url IS NULL AND oi.image_large_url IS NULL' : 'true'}${scopeClause(productIds, 'oi.product_id', orderParams)}
     ORDER BY o.order_number, oi.id`,
    orderParams,
  );

  return { plan, offered, orderItems };
}

// Photos per product as the resolver will see them AFTER the backfill.
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

export function buildReport(plan, offered, orderItems, imagesByProduct) {
  const labelled = plan.filter((g) => g.labels);
  const unmatched = plan.filter((g) => !g.labels);
  const countBy = (list, key) =>
    list.reduce((acc, item) => ((acc[key(item)] = (acc[key(item)] ?? 0) + 1), acc), {});

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
      groupsWithout9Rows: plan.filter((g) => g.row_count !== ROWS_PER_PHOTO).length,
      publishedProducts: offered.length,
      productColourGaps: missing.filter((m) => m.problem === 'no photo of this colour').length,
      productColourNoFront: missing.filter((m) => m.problem !== 'no photo of this colour').length,
      orderItemsToSnapshot: orderSnapshots.filter((s) => s.imageUrl).length,
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

export async function planAndReport(client, { productIds } = {}) {
  const { plan, offered, orderItems } = await loadPlan(client, { productIds });
  const imagesByProduct = await plannedImageRows(client, plan, [
    ...new Set([...plan.map((g) => g.product_id), ...offered.map((p) => p.product_id), ...orderItems.map((oi) => oi.product_id)]),
  ]);
  return { plan, report: buildReport(plan, offered, orderItems, imagesByProduct) };
}

export async function dryRun({ productIds } = {}) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN READ ONLY');
    const { report } = await planAndReport(client, { productIds });
    return report;
  } finally {
    await client.query('ROLLBACK').catch(() => {});
    client.release();
  }
}

// --- apply (atomic) ---------------------------------------------------------

// Throws BackfillAbort (after rolling back) on any difference from the
// reviewed dry run. `hooks.beforeVerify(client)` exists only so tests can
// simulate a change landing mid-apply.
export async function applyBackfill({ expectGroups, expectOrderItems, logDir, stamp, productIds, hooks = {} }) {
  if (!Number.isInteger(expectGroups) || !Number.isInteger(expectOrderItems)) {
    throw new BackfillAbort('--apply needs --expect-groups and --expect-order-items from the reviewed dry run');
  }
  const client = await pool.connect();
  const pendingPath = path.join(logDir, `image-gold-colour-change-log-${stamp}.pending.json`);
  const finalPath = path.join(logDir, `image-gold-colour-change-log-${stamp}.json`);
  let committed = false;
  try {
    await client.query('BEGIN');
    if (!(await hasColumn(client, 'product_images', 'gold_colour'))) {
      throw new BackfillAbort('Run the 20261024000000_product_image_gold_colour migration first.');
    }

    // Nothing may be labelled yet — otherwise this is a repeat run or an
    // admin has edited labels since the dry run. Either way: new dry run.
    const preParams = [];
    const { rows: pre } = await client.query(
      `SELECT COUNT(*)::int AS n FROM product_images WHERE (gold_colour <> 'ANY' OR shot_type <> 'OTHER')${scopeClause(productIds, 'product_id', preParams)}`,
      preParams,
    );
    if (pre[0].n !== 0) throw new BackfillAbort(`${pre[0].n} photo rows already carry labels — run a new dry run`);

    // Re-plan inside the transaction and hold it to the reviewed counts.
    const { plan, report } = await planAndReport(client, { productIds });
    const targets = plan.filter((g) => g.labels);
    const snapshots = report.orderSnapshots.filter((s) => s.imageUrl);
    if (targets.length !== expectGroups) throw new BackfillAbort(`plan has ${targets.length} photo groups, reviewed dry run had ${expectGroups}`);
    if (snapshots.length !== expectOrderItems) throw new BackfillAbort(`plan has ${snapshots.length} order items, reviewed dry run had ${expectOrderItems}`);

    // Lock every target row and check it is exactly what was planned.
    const { rows: locked } = await client.query(
      `SELECT pi.product_id, pi.sort_order, pi.created_at::text AS created_at, pi.gold_colour, pi.shot_type
       FROM product_images pi
       JOIN unnest($1::uuid[], $2::int[]) AS t(pid, so) ON pi.product_id = t.pid AND pi.sort_order = t.so
       ORDER BY pi.id
       FOR UPDATE OF pi`,
      [targets.map((g) => g.product_id), targets.map((g) => g.sort_order)],
    );
    const lockedByGroup = new Map();
    for (const row of locked) {
      const key = `${row.product_id}:${row.sort_order}`;
      if (!lockedByGroup.has(key)) lockedByGroup.set(key, []);
      lockedByGroup.get(key).push(row);
    }
    for (const g of targets) {
      const rows = lockedByGroup.get(`${g.product_id}:${g.sort_order}`) ?? [];
      if (rows.length !== ROWS_PER_PHOTO) throw new BackfillAbort(`${g.slug} #${g.sort_order}: ${rows.length} rows, expected ${ROWS_PER_PHOTO}`);
      if (rows.some((r) => r.created_at !== g.created_at)) throw new BackfillAbort(`${g.slug} #${g.sort_order}: rows no longer share timestamp ${g.created_at}`);
      if (rows.some((r) => r.gold_colour !== 'ANY' || r.shot_type !== 'OTHER')) throw new BackfillAbort(`${g.slug} #${g.sort_order}: a row is no longer ANY/OTHER`);
    }
    const { rows: lockedOrders } = await client.query(
      'SELECT id, image_url, image_large_url FROM order_items WHERE id = ANY($1::uuid[]) ORDER BY id FOR UPDATE',
      [snapshots.map((s) => s.orderItemId)],
    );
    if (lockedOrders.length !== snapshots.length || lockedOrders.some((o) => o.image_url !== null || o.image_large_url !== null)) {
      throw new BackfillAbort('an order item to snapshot is missing or already has an image');
    }

    // Apply — one statement for every photo, timestamps compared as timestamptz.
    const { rows: updated } = await client.query(
      `UPDATE product_images pi
       SET gold_colour = t.gc, shot_type = t.st
       FROM unnest($1::uuid[], $2::int[], $3::text[], $4::text[], $5::text[]) AS t(pid, so, ts, gc, st)
       WHERE pi.product_id = t.pid AND pi.sort_order = t.so AND pi.created_at = t.ts::timestamptz
         AND pi.gold_colour = 'ANY' AND pi.shot_type = 'OTHER'
       RETURNING pi.product_id, pi.sort_order`,
      [
        targets.map((g) => g.product_id),
        targets.map((g) => g.sort_order),
        targets.map((g) => g.created_at),
        targets.map((g) => g.labels.goldColour),
        targets.map((g) => g.labels.shotType),
      ],
    );
    let orderRowsUpdated = 0;
    for (const s of snapshots) {
      const { rowCount } = await client.query(
        'UPDATE order_items SET image_url = $2, image_large_url = $3 WHERE id = $1 AND image_url IS NULL AND image_large_url IS NULL',
        [s.orderItemId, s.imageUrl, s.imageLargeUrl],
      );
      orderRowsUpdated += rowCount;
    }

    if (hooks.beforeVerify) await hooks.beforeVerify(client);

    // Verify the exact counts before committing.
    const perGroup = new Map();
    for (const r of updated) perGroup.set(`${r.product_id}:${r.sort_order}`, (perGroup.get(`${r.product_id}:${r.sort_order}`) ?? 0) + 1);
    if (perGroup.size !== expectGroups) throw new BackfillAbort(`updated ${perGroup.size} photo groups, expected ${expectGroups}`);
    if (updated.length !== expectGroups * ROWS_PER_PHOTO) throw new BackfillAbort(`updated ${updated.length} rows, expected ${expectGroups * ROWS_PER_PHOTO}`);
    if ([...perGroup.values()].some((n) => n !== ROWS_PER_PHOTO)) throw new BackfillAbort('a photo group was only partly updated');
    if (orderRowsUpdated !== expectOrderItems) throw new BackfillAbort(`snapshotted ${orderRowsUpdated} order items, expected ${expectOrderItems}`);
    const postParams = [];
    const { rows: post } = await client.query(
      `SELECT
         COUNT(*) FILTER (WHERE gold_colour <> 'ANY' OR shot_type <> 'OTHER')::int AS labelled_rows,
         (SELECT COUNT(*)::int FROM (
            SELECT product_id, sort_order FROM product_images WHERE true${scopeClause(productIds, 'product_id', postParams)}
            GROUP BY 1, 2 HAVING COUNT(DISTINCT (gold_colour, shot_type)) > 1) s) AS mixed_groups
       FROM product_images WHERE true${scopeClause(productIds, 'product_id', postParams)}`,
      postParams,
    );
    const expectedLabelledRows = targets.filter((g) => !(g.labels.goldColour === 'ANY' && g.labels.shotType === 'OTHER')).length * ROWS_PER_PHOTO;
    if (post[0].labelled_rows !== expectedLabelledRows) throw new BackfillAbort(`${post[0].labelled_rows} labelled rows after apply, expected ${expectedLabelledRows}`);
    if (post[0].mixed_groups !== 0) throw new BackfillAbort(`${post[0].mixed_groups} photo groups have mixed labels`);

    // Change log first (as .pending), then COMMIT, then finalise it.
    const log = {
      createdAt: new Date().toISOString(),
      expectGroups,
      expectOrderItems,
      groups: targets.map((g) => ({
        productId: g.product_id,
        slug: g.slug,
        sortOrder: g.sort_order,
        createdAt: g.created_at,
        rows: ROWS_PER_PHOTO,
        before: { goldColour: 'ANY', shotType: 'OTHER' },
        after: g.labels,
      })),
      orderItems: snapshots.map((s) => ({
        orderItemId: s.orderItemId,
        orderNumber: s.orderNumber,
        before: { imageUrl: null, imageLargeUrl: null },
        after: { imageUrl: s.imageUrl, imageLargeUrl: s.imageLargeUrl },
      })),
    };
    fs.mkdirSync(logDir, { recursive: true });
    fs.writeFileSync(pendingPath, JSON.stringify(log, null, 1)); // a write failure here rolls back (catch below)

    try {
      await client.query('COMMIT');
    } catch (commitErr) {
      // Outcome unknown (e.g. connection lost during COMMIT) — keep the
      // pending log so the data can still be restored if it did commit.
      throw Object.assign(new Error(`COMMIT failed (${commitErr.message}) — check the database; restore data kept at ${pendingPath}`), { commitUnknown: true });
    }
    committed = true;

    try {
      fs.renameSync(pendingPath, finalPath);
      const check = JSON.parse(fs.readFileSync(finalPath, 'utf8'));
      if (check.groups.length !== expectGroups || check.orderItems.length !== expectOrderItems) throw new Error('change log content does not match');
    } catch (logErr) {
      // The database HAS committed — say so loudly; never hide it.
      throw Object.assign(new Error(`DATABASE COMMITTED, but finalising the change log failed (${logErr.message}). Restore data is in ${fs.existsSync(pendingPath) ? pendingPath : finalPath}`), { committed: true });
    }
    return { groupsUpdated: perGroup.size, rowsUpdated: updated.length, orderItemsUpdated: orderRowsUpdated, changeLog: finalPath, report };
  } catch (err) {
    if (!committed && !err.commitUnknown) {
      await client.query('ROLLBACK').catch(() => {});
      if (fs.existsSync(pendingPath)) fs.rmSync(pendingPath); // nothing was committed — the pending log is void
    }
    throw err;
  } finally {
    client.release();
  }
}

// --- restore (atomic, exact values) -----------------------------------------

export async function restoreBackfill(logPath) {
  const log = JSON.parse(fs.readFileSync(logPath, 'utf8'));
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    let rows = 0;
    for (const g of log.groups) {
      const { rowCount } = await client.query(
        'UPDATE product_images SET gold_colour = $3, shot_type = $4 WHERE product_id = $1 AND sort_order = $2',
        [g.productId, g.sortOrder, g.before.goldColour, g.before.shotType],
      );
      if (g.rows !== undefined && rowCount !== g.rows) throw new BackfillAbort(`${g.slug ?? g.productId} #${g.sortOrder}: ${rowCount} rows, change log recorded ${g.rows}`);
      rows += rowCount;
    }
    for (const oi of log.orderItems) {
      const before = oi.before ?? { imageUrl: null, imageLargeUrl: null };
      const { rowCount } = await client.query('UPDATE order_items SET image_url = $2, image_large_url = $3 WHERE id = $1', [
        oi.orderItemId,
        before.imageUrl,
        before.imageLargeUrl,
      ]);
      if (rowCount !== 1) throw new BackfillAbort(`order item ${oi.orderItemId} not found`);
    }
    await client.query('COMMIT');
    return { groups: log.groups.length, rows, orderItems: log.orderItems.length };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

// --- report files -------------------------------------------------------------

function writeReport(report, outDir, prefix, stamp) {
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
    `To apply exactly this plan: --apply --expect-groups=${t.willBeLabelled} --expect-order-items=${t.orderItemsToSnapshot}`,
    '',
    'Unmatched photos:',
    ...report.unmatched.map((u) => `  ${u.slug} #${u.sortOrder} ${u.type} ${u.status} — ${u.reason}${u.isPrimary ? ' (featured)' : ''}`),
  ];
  const txtPath = path.join(outDir, `${prefix}-${stamp}.txt`);
  fs.writeFileSync(txtPath, `${lines.join('\n')}\n`);
  const csv = ['slug,name,colour,problem', ...report.missingColour.map((m) => [m.slug, `"${m.name.replace(/"/g, '""')}"`, m.colour, m.problem].join(','))];
  const csvPath = path.join(outDir, `${prefix}-missing-colour-${stamp}.csv`);
  fs.writeFileSync(csvPath, `${csv.join('\n')}\n`);
  return { jsonPath, txtPath, csvPath, summary: lines.slice(0, lines.indexOf('Unmatched photos:')).join('\n') };
}

// --- CLI ----------------------------------------------------------------------

async function main(args) {
  const arg = (name) => args.find((a) => a.startsWith(`--${name}=`))?.split('=').slice(1).join('=');
  const outDir = arg('out') ?? process.cwd();
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');

  if (arg('restore')) {
    const r = await restoreBackfill(arg('restore'));
    console.log(`Restored ${r.groups} photo groups (${r.rows} rows) and ${r.orderItems} order items.`);
    return;
  }
  if (args.includes('--apply')) {
    const expectGroups = arg('expect-groups') === undefined ? NaN : Number(arg('expect-groups'));
    const expectOrderItems = arg('expect-order-items') === undefined ? NaN : Number(arg('expect-order-items'));
    const r = await applyBackfill({ expectGroups, expectOrderItems, logDir: outDir, stamp });
    const paths = writeReport(r.report, outDir, 'image-gold-colour-applied', stamp);
    console.log(`COMMITTED: ${r.groupsUpdated} photo groups (${r.rowsUpdated} rows) labelled, ${r.orderItemsUpdated} order items snapshotted.`);
    console.log(`Change log (for --restore): ${r.changeLog}\nReport: ${paths.txtPath}`);
    return;
  }
  const report = await dryRun();
  const paths = writeReport(report, outDir, 'image-gold-colour-dry-run', stamp);
  console.log(paths.summary);
  console.log(`Dry run — nothing changed.\nReport: ${paths.txtPath}\nFull data: ${paths.jsonPath}\nMissing colours: ${paths.csvPath}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main(process.argv.slice(2))
    .catch((err) => {
      if (err instanceof BackfillAbort) console.error(`ABORTED — nothing was changed (rolled back): ${err.message}`);
      else console.error(err);
      process.exitCode = 1;
    })
    .finally(() => pool.end());
}
