// Adds the Cache-Control header new uploads get (storageProvider.s3.js) to
// existing S3 objects — which have none, so browsers re-download every
// banner and product photo on every visit — with a snapshot, a pilot scope
// and a rollback.
//
// S3 can't edit headers in place: each object is copied onto itself with
// MetadataDirective REPLACE, re-sending everything that must survive the
// copy (content headers, user metadata, storage class, encryption). Image
// bytes, keys and URLs don't change. Assumes bucket versioning is OFF (a
// copy then replaces the object; with versioning on, every copy would keep
// a hidden old version). backup-* prefixes are never touched.
//
// Usage (run from backend/):
//   node scripts/setS3CacheControl.js --snapshot=FILE
//       Read-only. Writes one JSON line per object: key + the headers
//       rollback needs (+ size and ETag, to prove the bytes didn't change).
//   node scripts/setS3CacheControl.js --apply --snapshot=FILE [--prefix=a,b | --key=K] [--limit=N]
//       Sets the header on objects in the snapshot (optionally only these
//       prefixes / one key). Refuses objects missing from the snapshot.
//       Updates one image first and checks it anonymously at its public URL
//       (status, header, unchanged size/ETag) before touching the rest.
//   node scripts/setS3CacheControl.js --rollback --snapshot=FILE [--prefix=a,b | --key=K]
//       Restores each object's headers exactly as recorded in the snapshot.
//   node scripts/setS3CacheControl.js --verify --snapshot=FILE [--prefix=a,b | --key=K]
//       Read-only. Compares current headers/size/ETag with the snapshot.

import fs from 'node:fs';
import readline from 'node:readline';
import {
  S3Client,
  ListObjectsV2Command,
  HeadObjectCommand,
  CopyObjectCommand,
} from '@aws-sdk/client-s3';
import { env } from '../src/config/env.js';
import { S3_CACHE_CONTROL } from '../src/providers/storage/storageProvider.s3.js';

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, ...v] = a.replace(/^--/, '').split('=');
    return [k, v.length ? v.join('=') : true];
  }),
);
const mode = args.apply ? 'apply' : args.rollback ? 'rollback' : args.verify ? 'verify' : 'snapshot';
const snapshotFile = args.snapshot;
const prefixes = args.prefix ? String(args.prefix).split(',').map((p) => p.replace(/\/?$/, '/')) : null;
const onlyKey = args.key ? String(args.key) : null;
const limit = args.limit ? Number(args.limit) : Infinity;
const CONCURRENCY = 16;

if (env.storageProvider !== 's3') {
  console.log(`STORAGE_PROVIDER is "${env.storageProvider}", not "s3" — nothing to do.`);
  process.exit(0);
}
if (!snapshotFile) {
  console.error('--snapshot=FILE is required (written in snapshot mode, read in the others).');
  process.exit(1);
}

const client = new S3Client({
  region: env.s3Region,
  ...(env.s3AccessKeyId && env.s3SecretAccessKey
    ? { credentials: { accessKeyId: env.s3AccessKeyId, secretAccessKey: env.s3SecretAccessKey } }
    : {}),
});
const Bucket = env.s3Bucket;
const publicBase = (env.s3PublicBaseUrl || `https://${Bucket}.s3.${env.s3Region}.amazonaws.com`).replace(/\/$/, '');
const publicUrl = (key) => `${publicBase}/${key.split('/').map(encodeURIComponent).join('/')}`;
const copySource = (key) => `${Bucket}/${key.split('/').map(encodeURIComponent).join('/')}`;

async function head(key) {
  const h = await client.send(new HeadObjectCommand({ Bucket, Key: key }));
  return {
    key,
    ContentType: h.ContentType,
    CacheControl: h.CacheControl ?? null,
    ContentDisposition: h.ContentDisposition ?? null,
    ContentEncoding: h.ContentEncoding ?? null,
    ContentLanguage: h.ContentLanguage ?? null,
    Metadata: h.Metadata ?? {},
    StorageClass: h.StorageClass ?? null,
    ServerSideEncryption: h.ServerSideEncryption ?? null,
    ETag: h.ETag,
    ContentLength: h.ContentLength,
  };
}

async function runPool(items, fn) {
  let next = 0;
  let done = 0;
  async function worker() {
    while (next < items.length) {
      const item = items[next++];
      await fn(item);
      done += 1;
      if (done % 2000 === 0) console.log(`  ...${done}/${items.length}`);
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
}

const inScope = (key) =>
  !key.startsWith('backup-') &&
  !key.endsWith('/') &&
  (onlyKey ? key === onlyKey : prefixes ? prefixes.some((p) => key.startsWith(p)) : true);

// ---------- snapshot (read-only) ----------
if (mode === 'snapshot') {
  if (fs.existsSync(snapshotFile)) {
    console.error(`${snapshotFile} already exists — refusing to overwrite a snapshot.`);
    process.exit(1);
  }
  const keys = [];
  let token;
  do {
    const page = await client.send(new ListObjectsV2Command({ Bucket, ContinuationToken: token }));
    for (const o of page.Contents ?? []) if (inScope(o.Key)) keys.push(o.Key);
    token = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (token);
  const out = fs.createWriteStream(snapshotFile, { flags: 'wx' });
  let failed = 0;
  await runPool(keys, async (key) => {
    try {
      out.write(`${JSON.stringify(await head(key))}\n`);
    } catch (err) {
      failed += 1;
      console.error(`  head failed ${key}: ${err.name}`);
    }
  });
  await new Promise((r) => out.end(r));
  console.log(`Snapshot: ${keys.length - failed}/${keys.length} objects written to ${snapshotFile}`);
  process.exit(failed ? 1 : 0);
}

// ---------- load snapshot for apply / rollback / verify ----------
const snapshot = new Map();
for await (const line of readline.createInterface({ input: fs.createReadStream(snapshotFile) })) {
  if (!line.trim()) continue;
  const rec = JSON.parse(line);
  snapshot.set(rec.key, rec);
}
const targets = [...snapshot.keys()].filter(inScope).slice(0, limit);
if (onlyKey && !snapshot.has(onlyKey)) {
  console.error(`${onlyKey} is not in the snapshot — refusing.`);
  process.exit(1);
}
console.log(`${mode}: ${targets.length} object(s) in scope (snapshot has ${snapshot.size}).`);

function copyWith(rec, cacheControl, current) {
  return client.send(
    new CopyObjectCommand({
      Bucket,
      Key: rec.key,
      CopySource: copySource(rec.key),
      MetadataDirective: 'REPLACE',
      // Headers come from the snapshot, so rollback restores exactly them.
      ContentType: rec.ContentType,
      ContentDisposition: rec.ContentDisposition ?? undefined,
      ContentEncoding: rec.ContentEncoding ?? undefined,
      ContentLanguage: rec.ContentLanguage ?? undefined,
      Metadata: rec.Metadata,
      StorageClass: rec.StorageClass ?? undefined,
      ServerSideEncryption: rec.ServerSideEncryption ?? undefined,
      CacheControl: cacheControl ?? undefined,
      // Only copy if the bytes are still the ones we checked just now.
      CopySourceIfMatch: current.ETag,
    }),
  );
}

// Same bytes as in the snapshot, and the expected header.
function check(rec, now, expectedCacheControl) {
  const problems = [];
  if (now.ETag !== rec.ETag) problems.push(`ETag ${rec.ETag} -> ${now.ETag}`);
  if (now.ContentLength !== rec.ContentLength) problems.push(`size ${rec.ContentLength} -> ${now.ContentLength}`);
  if (now.ContentType !== rec.ContentType) problems.push(`type ${rec.ContentType} -> ${now.ContentType}`);
  if ((now.CacheControl ?? null) !== (expectedCacheControl ?? null)) problems.push(`Cache-Control ${now.CacheControl}`);
  if (JSON.stringify(now.Metadata) !== JSON.stringify(rec.Metadata)) problems.push('metadata changed');
  if ((now.ServerSideEncryption ?? null) !== (rec.ServerSideEncryption ?? null)) problems.push('encryption changed');
  return problems;
}

// ---------- verify (read-only) ----------
if (mode === 'verify') {
  const tally = { withHeader: 0, original: 0, problems: 0 };
  await runPool(targets, async (key) => {
    const rec = snapshot.get(key);
    const now = await head(key);
    const expected = now.CacheControl === S3_CACHE_CONTROL ? S3_CACHE_CONTROL : rec.CacheControl;
    const problems = check(rec, now, expected);
    if (problems.length) {
      tally.problems += 1;
      console.error(`  ${key}: ${problems.join('; ')}`);
    } else if (now.CacheControl === S3_CACHE_CONTROL) tally.withHeader += 1;
    else tally.original += 1;
  });
  console.log(`Verify: ${tally.withHeader} with new header, ${tally.original} as in snapshot, ${tally.problems} problem(s).`);
  process.exit(tally.problems ? 1 : 0);
}

// ---------- apply / rollback ----------
const want = (rec) => (mode === 'apply' ? S3_CACHE_CONTROL : rec.CacheControl);
const tally = { changed: 0, skipped: 0, failed: 0 };

async function processKey(key) {
  const rec = snapshot.get(key);
  const current = await head(key);
  if ((current.CacheControl ?? null) === (want(rec) ?? null)) {
    tally.skipped += 1;
    return;
  }
  if (current.ETag !== rec.ETag) throw new Error(`bytes changed since snapshot (${rec.ETag} -> ${current.ETag})`);
  await copyWith(rec, want(rec), current);
  const problems = check(rec, await head(key), want(rec));
  if (problems.length) throw new Error(problems.join('; '));
  tally.changed += 1;
}

// Canary: first object, then an anonymous public fetch (what browsers get).
const canary = targets[0];
if (!canary) process.exit(0);
await processKey(canary);
const res = await fetch(publicUrl(canary), { method: 'HEAD' });
const pubCache = res.headers.get('cache-control');
console.log(`Canary ${canary}: public HTTP ${res.status}, Cache-Control=${pubCache ?? '(none)'}`);
if (res.status !== 200 || (pubCache ?? null) !== (want(snapshot.get(canary)) ?? null)) {
  console.error('Canary failed — stopping before any other object.');
  process.exit(1);
}

await runPool(targets.slice(1), async (key) => {
  try {
    await processKey(key);
  } catch (err) {
    tally.failed += 1;
    console.error(`  failed ${key}: ${err.message}`);
  }
});
console.log(`${mode} done: ${tally.changed} changed, ${tally.skipped} already as wanted, ${tally.failed} failed.`);
process.exit(tally.failed ? 1 : 0);
