// One-off: give existing products a permanent SKU (BD-{TYPE}-{NUMBER}, see
// src/services/productSkuService.js) in place of the browser-generated
// DRAFT-<timestamp> codes, keeping each old code in products.legacy_sku.
//
// - Jewellery type: products.jewellery_type if set, otherwise the type the
//   admin confirmed in AI Studio (ai_studio_jobs.jewellery_type). Products
//   whose jobs disagree, or with no type at all, are NOT migrated until a
//   type is confirmed in sku-type-decisions.json (which can also hold or
//   exclude specific products).
// - Only DRAFT-… codes are replaced. Hand-entered codes (SKU3450, bx234,
//   BD-NECK-0001, …) are preserved.
// - order_items.product_sku (the code frozen on each order line, used by
//   invoices / work orders / order pages) is never touched — apply verifies
//   that inside its transaction.
// - Products that only lack a jewellery type also get it stored (no SKU
//   change) — needed for anything created from them later.
//
//   node scripts/migrateDraftSkus.js [--out=DIR] [--decisions=FILE]
//       Dry run (default). READ ONLY transaction; report + old→new CSV.
//       Reviewed per-product decisions come from sku-type-decisions.json.
//   node scripts/migrateDraftSkus.js --apply --expect-skus=N --expect-types=M [--out=DIR]
//       One transaction: re-plan, lock target rows, check each still has the
//       code the plan saw, apply, verify exact counts and that order lines are
//       unchanged. Any difference rolls everything back. Change log written
//       as .pending before COMMIT, finalised after.
//   node scripts/migrateDraftSkus.js --restore=CHANGE_LOG.json
//       Puts every SKU, legacy_sku and jewellery_type back exactly as logged.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { pool } from '../src/config/db.js';
import { formatSku, SKU_TYPE_CODES } from '../src/services/productSkuService.js';

// Reviewed per-product decisions (sku-type-decisions.json, keyed by product
// id): 'decisions' fix a product's type; 'hold' and 'exclude' leave it
// exactly as it is (no SKU, no type) until a later decision.
const DEFAULT_DECISIONS_FILE = new URL('./sku-type-decisions.json', import.meta.url);
const EMPTY_DECISIONS = { decisions: {}, hold: {}, exclude: {} };

export function loadDecisions(file = DEFAULT_DECISIONS_FILE) {
  const d = JSON.parse(fs.readFileSync(file, 'utf8'));
  for (const [id, v] of Object.entries(d.decisions ?? {})) {
    if (!SKU_TYPE_CODES[v.type]) throw new Error(`decision for ${id}: unsupported type ${v.type}`);
  }
  const overlap = Object.keys(d.decisions ?? {}).filter((id) => d.hold?.[id] || d.exclude?.[id]);
  if (overlap.length) throw new Error(`products both decided and held/excluded: ${overlap.join(', ')}`);
  return { decisions: d.decisions ?? {}, hold: d.hold ?? {}, exclude: d.exclude ?? {} };
}

export class MigrationAbort extends Error {}

function scope(productIds, column, params) {
  if (!productIds) return '';
  params.push(productIds);
  return ` AND ${column} = ANY($${params.length})`;
}

async function orderItemsFingerprint(client) {
  const { rows } = await client.query(
    `SELECT COUNT(*)::int AS n, COALESCE(md5(string_agg(id::text || ':' || product_sku, ',' ORDER BY id)), '') AS h FROM order_items`,
  );
  return rows[0];
}

export async function buildPlan(client, { productIds, decisions = EMPTY_DECISIONS } = {}) {
  const params = [];
  const { rows: products } = await client.query(
    `SELECT p.id, p.slug, p.name, p.status, p.sku, p.legacy_sku, p.jewellery_type, p.created_at,
            (SELECT array_agg(DISTINCT j.jewellery_type ORDER BY j.jewellery_type)
             FROM ai_studio_jobs j WHERE j.product_id = p.id AND j.jewellery_type IS NOT NULL) AS studio_types
     FROM products p
     WHERE true${scope(productIds, 'p.id', params)}
     ORDER BY p.created_at, p.id`,
    params,
  );

  const plan = products.map((p) => {
    const studio = p.studio_types ?? [];
    const isDraft = /^DRAFT-/.test(p.sku);
    const held = decisions.exclude[p.id] ?? decisions.hold[p.id];
    if (held) {
      const kind = decisions.exclude[p.id] ? 'exclude' : 'hold';
      return { ...p, type: null, typeSource: null, action: kind, reason: `${kind === 'exclude' ? 'excluded' : 'on hold'}: ${held.note}`, setType: null };
    }

    let type = p.jewellery_type;
    let typeSource = type ? 'product' : null;
    if (!type && decisions.decisions[p.id]) [type, typeSource] = [decisions.decisions[p.id].type, 'business decision'];
    if (!type && studio.length === 1 && SKU_TYPE_CODES[studio[0]]) [type, typeSource] = [studio[0], 'AI Studio'];

    let action;
    let reason;
    if (!isDraft) {
      action = 'keep';
      reason = p.legacy_sku ? 'already migrated' : 'manual SKU preserved';
    } else if (p.legacy_sku) {
      action = 'exclude';
      reason = 'has a legacy_sku already — inspect';
    } else if (!type) {
      action = 'exclude';
      reason = studio.length > 1 ? `conflicting jewellery types (${studio.join(' / ')}) — confirm first` : 'no jewellery type — confirm first';
    } else {
      action = 'migrate';
      reason = `type from ${typeSource}`;
    }
    const setType = !p.jewellery_type && type ? type : null;
    return { ...p, type, typeSource, action, reason, setType };
  });

  const { rows: seq } = await client.query('SELECT last_value, is_called FROM product_sku_seq');
  let next = Number(seq[0].is_called ? Number(seq[0].last_value) + 1 : seq[0].last_value);
  for (const p of plan.filter((x) => x.action === 'migrate')) p.proposedSku = formatSku(p.type, next++);

  const { rows: reserved } = await client.query(
    `SELECT COUNT(*)::int AS n FROM products WHERE sku ~ '^BD-[A-Z]{3}-[0-9]{6,}$'${productIds ? ' AND id = ANY($1)' : ''}`,
    productIds ? [productIds] : [],
  );
  return { plan, existingGeneratedCodes: reserved[0].n };
}

export function summarise(plan, existingGeneratedCodes) {
  const by = (f) => plan.reduce((a, p) => ((a[f(p)] = (a[f(p)] ?? 0) + 1), a), {});
  const migrate = plan.filter((p) => p.action === 'migrate');
  return {
    generatedAt: new Date().toISOString(),
    totals: {
      products: plan.length,
      draftCodes: plan.filter((p) => /^DRAFT-/.test(p.sku)).length,
      toMigrate: migrate.length,
      toMigrateByStatus: by((p) => (p.action === 'migrate' ? p.status : '-')),
      toMigrateByType: migrate.reduce((a, p) => ((a[p.type] = (a[p.type] ?? 0) + 1), a), {}),
      typeOnly: plan.filter((p) => p.setType && p.action !== 'migrate').length,
      typesToSet: plan.filter((p) => p.setType).length,
      excluded: plan.filter((p) => p.action === 'exclude').length,
      onHold: plan.filter((p) => p.action === 'hold').length,
      draftCodesByStatus: plan.filter((p) => /^DRAFT-/.test(p.sku)).reduce((a, p) => ((a[p.status] = (a[p.status] ?? 0) + 1), a), {}),
      notMigratedDraftByReason: plan
        .filter((p) => /^DRAFT-/.test(p.sku) && p.action !== 'migrate')
        .reduce((a, p) => ((a[`${p.status}: ${p.action}`] = (a[`${p.status}: ${p.action}`] ?? 0) + 1), a), {}),
      preservedManual: plan.filter((p) => p.action === 'keep').length,
      existingGeneratedCodes,
    },
    excluded: plan.filter((p) => p.action === 'exclude' || p.action === 'hold').map((p) => ({ id: p.id, slug: p.slug, status: p.status, sku: p.sku, action: p.action, reason: p.reason })),
    preserved: plan.filter((p) => p.action === 'keep').map((p) => ({ slug: p.slug, status: p.status, sku: p.sku, reason: p.reason })),
    mapping: migrate.map((p) => ({ id: p.id, slug: p.slug, status: p.status, jewelleryType: p.type, oldSku: p.sku, proposedSku: p.proposedSku })),
  };
}

export async function dryRun({ productIds, decisions } = {}) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN READ ONLY');
    const { plan, existingGeneratedCodes } = await buildPlan(client, { productIds, decisions });
    return summarise(plan, existingGeneratedCodes);
  } finally {
    await client.query('ROLLBACK').catch(() => {});
    client.release();
  }
}

export async function applyMigration({ expectSkus, expectTypes, logDir, stamp, productIds, decisions, hooks = {} }) {
  if (!Number.isInteger(expectSkus) || !Number.isInteger(expectTypes)) {
    throw new MigrationAbort('--apply needs --expect-skus and --expect-types from the reviewed dry run');
  }
  const client = await pool.connect();
  const pendingPath = path.join(logDir, `sku-migration-change-log-${stamp}.pending.json`);
  const finalPath = path.join(logDir, `sku-migration-change-log-${stamp}.json`);
  let committed = false;
  try {
    await client.query('BEGIN');
    const ordersBefore = await orderItemsFingerprint(client);
    const { plan } = await buildPlan(client, { productIds, decisions });
    const targets = plan.filter((p) => p.action === 'migrate');
    const typeTargets = plan.filter((p) => p.setType);
    if (targets.length !== expectSkus) throw new MigrationAbort(`plan has ${targets.length} SKUs to migrate, reviewed dry run had ${expectSkus}`);
    if (typeTargets.length !== expectTypes) throw new MigrationAbort(`plan sets ${typeTargets.length} jewellery types, reviewed dry run had ${expectTypes}`);

    // Lock every product row this touches and re-check what the plan saw.
    const ids = [...new Set([...targets, ...typeTargets].map((p) => p.id))];
    const { rows: locked } = await client.query(
      'SELECT id, sku, legacy_sku, jewellery_type FROM products WHERE id = ANY($1::uuid[]) ORDER BY id FOR UPDATE',
      [ids],
    );
    const lockedById = new Map(locked.map((r) => [r.id, r]));
    for (const p of [...targets, ...typeTargets]) {
      const r = lockedById.get(p.id);
      if (!r || r.sku !== p.sku || r.legacy_sku !== p.legacy_sku || r.jewellery_type !== p.jewellery_type) {
        throw new MigrationAbort(`${p.slug}: changed since planning — run a new dry run`);
      }
    }

    const log = { createdAt: new Date().toISOString(), expectSkus, expectTypes, products: [] };
    let skuRows = 0;
    let typeRows = 0;
    for (const p of plan.filter((x) => x.action === 'migrate' || x.setType)) {
      const entry = { id: p.id, slug: p.slug, before: { sku: p.sku, legacySku: p.legacy_sku, jewelleryType: p.jewellery_type }, after: { sku: p.sku, legacySku: p.legacy_sku, jewelleryType: p.jewellery_type } };
      if (p.setType) {
        await client.query('UPDATE products SET jewellery_type = $2 WHERE id = $1 AND jewellery_type IS NULL', [p.id, p.setType]);
        entry.after.jewelleryType = p.setType;
        typeRows++;
      }
      if (p.action === 'migrate') {
        const { rows } = await client.query(
          `UPDATE products
           SET legacy_sku = sku,
               sku = 'BD-' || $3 || '-' || lpad(nextval('product_sku_seq')::text, 6, '0'),
               updated_at = now()
           WHERE id = $1 AND sku = $2 AND legacy_sku IS NULL
           RETURNING sku`,
          [p.id, p.sku, SKU_TYPE_CODES[p.type]],
        );
        if (rows.length !== 1) throw new MigrationAbort(`${p.slug}: SKU update matched ${rows.length} rows`);
        entry.after.sku = rows[0].sku;
        entry.after.legacySku = p.sku;
        skuRows++;
      }
      log.products.push(entry);
    }

    if (hooks.beforeVerify) await hooks.beforeVerify(client);

    // Exact counts, no DRAFT left on migrated rows, order lines untouched.
    if (skuRows !== expectSkus) throw new MigrationAbort(`migrated ${skuRows} SKUs, expected ${expectSkus}`);
    if (typeRows !== expectTypes) throw new MigrationAbort(`set ${typeRows} jewellery types, expected ${expectTypes}`);
    const { rows: check } = await client.query(
      `SELECT COUNT(*) FILTER (WHERE sku LIKE 'DRAFT-%')::int AS draft_left,
              COUNT(*) FILTER (WHERE sku !~ '^BD-[A-Z]{3}-[0-9]{6,}$')::int AS bad_format,
              COUNT(*) FILTER (WHERE legacy_sku NOT LIKE 'DRAFT-%')::int AS bad_legacy
       FROM products WHERE id = ANY($1::uuid[])`,
      [targets.map((p) => p.id)],
    );
    if (check[0].draft_left || check[0].bad_format || check[0].bad_legacy) throw new MigrationAbort(`post-check failed: ${JSON.stringify(check[0])}`);
    const ordersAfter = await orderItemsFingerprint(client);
    if (ordersAfter.n !== ordersBefore.n || ordersAfter.h !== ordersBefore.h) throw new MigrationAbort('order_items changed — aborting');

    fs.mkdirSync(logDir, { recursive: true });
    fs.writeFileSync(pendingPath, JSON.stringify(log, null, 1));
    try {
      await client.query('COMMIT');
    } catch (commitErr) {
      throw Object.assign(new Error(`COMMIT failed (${commitErr.message}) — check the database; restore data kept at ${pendingPath}`), { commitUnknown: true });
    }
    committed = true;
    try {
      fs.renameSync(pendingPath, finalPath);
      const reread = JSON.parse(fs.readFileSync(finalPath, 'utf8'));
      if (reread.products.length !== log.products.length) throw new Error('change log content mismatch');
    } catch (logErr) {
      throw Object.assign(new Error(`DATABASE COMMITTED, but finalising the change log failed (${logErr.message}). Restore data is in ${fs.existsSync(pendingPath) ? pendingPath : finalPath}`), { committed: true });
    }
    return { skusMigrated: skuRows, typesSet: typeRows, changeLog: finalPath, log };
  } catch (err) {
    if (!committed && !err.commitUnknown) {
      await client.query('ROLLBACK').catch(() => {});
      if (fs.existsSync(pendingPath)) fs.rmSync(pendingPath);
    }
    throw err;
  } finally {
    client.release();
  }
}

export async function restoreMigration(logPath) {
  const log = JSON.parse(fs.readFileSync(logPath, 'utf8'));
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const ordersBefore = await orderItemsFingerprint(client);
    for (const e of log.products) {
      const { rowCount } = await client.query(
        `UPDATE products SET sku = $2, legacy_sku = $3, jewellery_type = $4, updated_at = now()
         WHERE id = $1 AND sku = $5 AND legacy_sku IS NOT DISTINCT FROM $6 AND jewellery_type IS NOT DISTINCT FROM $7`,
        [e.id, e.before.sku, e.before.legacySku, e.before.jewelleryType, e.after.sku, e.after.legacySku, e.after.jewelleryType],
      );
      if (rowCount !== 1) throw new MigrationAbort(`${e.slug}: not in the state the change log recorded — nothing restored`);
    }
    const ordersAfter = await orderItemsFingerprint(client);
    if (ordersAfter.h !== ordersBefore.h) throw new MigrationAbort('order_items changed — aborting');
    await client.query('COMMIT');
    return { restored: log.products.length };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

function writeReport(report, outDir, prefix, stamp) {
  fs.mkdirSync(outDir, { recursive: true });
  const base = path.join(outDir, `${prefix}-${stamp}`);
  fs.writeFileSync(`${base}.json`, JSON.stringify(report, null, 1));
  const csv = ['product_id,slug,status,jewellery_type,old_sku,proposed_sku', ...report.mapping.map((m) => [m.id, m.slug, m.status, m.jewelleryType, m.oldSku, m.proposedSku].join(','))];
  fs.writeFileSync(`${base}-mapping.csv`, `${csv.join('\n')}\n`);
  const t = report.totals;
  const lines = [
    `Permanent SKU migration — ${prefix} — ${report.generatedAt}`,
    `Products: ${t.products} · DRAFT codes: ${t.draftCodes}`,
    `To migrate: ${t.toMigrate} (${Object.entries(t.toMigrateByStatus).filter(([k]) => k !== '-').map(([k, v]) => `${k} ${v}`).join(', ')})`,
    `By type: ${Object.entries(t.toMigrateByType).map(([k, v]) => `${k} ${v}`).join(', ')}`,
    `Jewellery types to store: ${t.typesToSet} (of which type-only, no SKU change: ${t.typeOnly})`,
    `DRAFT codes by status: ${Object.entries(t.draftCodesByStatus).map(([k, v]) => `${k} ${v}`).join(', ')}`,
    `DRAFT codes NOT migrated: ${Object.entries(t.notMigratedDraftByReason).map(([k, v]) => `${k} ${v}`).join(', ') || 'none'}`,
    `Excluded: ${t.excluded} · On hold: ${t.onHold} · Manual SKUs preserved: ${t.preservedManual} · Products already on BD-XXX-000000: ${t.existingGeneratedCodes}`,
    `To apply exactly this plan: --apply --expect-skus=${t.toMigrate} --expect-types=${t.typesToSet}`,
    '',
    'Excluded / on hold:',
    ...report.excluded.map((e) => `  ${e.slug} [${e.status}] ${e.sku} — ${e.reason}`),
    'Preserved:',
    ...report.preserved.map((e) => `  ${e.slug} [${e.status}] ${e.sku} — ${e.reason}`),
    'First proposed codes:',
    ...report.mapping.slice(0, 5).map((m) => `  ${m.oldSku} → ${m.proposedSku}  (${m.jewelleryType}, ${m.slug})`),
  ];
  fs.writeFileSync(`${base}.txt`, `${lines.join('\n')}\n`);
  return { txt: `${base}.txt`, csv: `${base}-mapping.csv`, json: `${base}.json`, summary: lines.join('\n') };
}

async function main(args) {
  const arg = (n) => args.find((a) => a.startsWith(`--${n}=`))?.split('=').slice(1).join('=');
  const outDir = arg('out') ?? process.cwd();
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  if (arg('restore')) {
    const r = await restoreMigration(arg('restore'));
    console.log(`Restored ${r.restored} products to their logged SKU / legacy_sku / jewellery_type.`);
    return;
  }
  if (args.includes('--apply')) {
    const num = (n) => (arg(n) === undefined ? NaN : Number(arg(n)));
    const r = await applyMigration({ expectSkus: num('expect-skus'), expectTypes: num('expect-types'), logDir: outDir, stamp, decisions: loadDecisions(arg('decisions')) });
    console.log(`COMMITTED: ${r.skusMigrated} SKUs migrated, ${r.typesSet} jewellery types stored.\nChange log (for --restore): ${r.changeLog}`);
    // Product pages show the SKU (and carry it in their JSON-LD) — cached SSR
    // HTML would keep the old code until its TTL otherwise.
    const { rowCount } = await pool.query('DELETE FROM page_cache');
    console.log(`Page cache cleared (${rowCount} rows).`);
    return;
  }
  const report = await dryRun({ decisions: loadDecisions(arg('decisions')) });
  const files = writeReport(report, outDir, 'sku-migration-dry-run', stamp);
  console.log(files.summary);
  console.log(`\nDry run — nothing changed.\nReport: ${files.txt}\nMapping CSV: ${files.csv}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main(process.argv.slice(2))
    .catch((err) => {
      if (err instanceof MigrationAbort) console.error(`ABORTED — nothing was changed (rolled back): ${err.message}`);
      else console.error(err);
      process.exitCode = 1;
    })
    .finally(() => pool.end());
}
