// One-off: gives every existing S3 object the same Cache-Control header new
// uploads now get (storageProvider.s3.js). Objects uploaded before that
// change have no Cache-Control at all, so browsers re-download every
// banner and product photo on every visit.
//
// S3 can't edit headers in place — each object is copied onto itself with
// MetadataDirective REPLACE, re-sending everything that must survive the
// copy (Content-Type and the other content headers, user metadata, storage
// class, encryption). The image bytes and URLs don't change. Objects that
// already have the header are skipped, so it's safe to re-run, and backup
// prefixes (backup-*) are left alone.
//
// Dry run by default: lists the bucket, reports counts per folder and the
// bucket's public-access setup (copies must not make images private), and
// changes nothing.
// Usage: node backend/scripts/setS3CacheControl.js
//        node backend/scripts/setS3CacheControl.js --apply

import {
  S3Client,
  ListObjectsV2Command,
  HeadObjectCommand,
  CopyObjectCommand,
  GetBucketOwnershipControlsCommand,
  GetBucketPolicyStatusCommand,
} from '@aws-sdk/client-s3';
import { env } from '../src/config/env.js';
import { S3_CACHE_CONTROL } from '../src/providers/storage/storageProvider.s3.js';

const apply = process.argv.includes('--apply');
const CONCURRENCY = 16;

if (env.storageProvider !== 's3') {
  console.log(`STORAGE_PROVIDER is "${env.storageProvider}", not "s3" — nothing to do.`);
  process.exit(0);
}

const client = new S3Client({
  region: env.s3Region,
  ...(env.s3AccessKeyId && env.s3SecretAccessKey
    ? { credentials: { accessKeyId: env.s3AccessKeyId, secretAccessKey: env.s3SecretAccessKey } }
    : {}),
});
const Bucket = env.s3Bucket;

async function describe(command) {
  try {
    return await client.send(command);
  } catch (err) {
    return { error: err.name };
  }
}

// Public read must come from the bucket policy, not per-object ACLs: a
// copy without an ACL resets the object's ACL to private, which would
// break every image whose public access came from an ACL.
const ownership = await describe(new GetBucketOwnershipControlsCommand({ Bucket }));
const policyStatus = await describe(new GetBucketPolicyStatusCommand({ Bucket }));
const objectOwnership = ownership.OwnershipControls?.Rules?.[0]?.ObjectOwnership ?? ownership.error;
const policyIsPublic = policyStatus.PolicyStatus?.IsPublic ?? policyStatus.error;
console.log(`Bucket ${Bucket}: ObjectOwnership=${objectOwnership}, bucket policy public=${policyIsPublic}`);
// The app's own IAM user may not be allowed to read these settings
// (AccessDenied), so --apply doesn't rely on them: it updates one image
// first and checks it anonymously at its public URL before touching the
// rest (see canary below).

const keys = [];
let continuationToken;
do {
  const page = await client.send(new ListObjectsV2Command({ Bucket, ContinuationToken: continuationToken }));
  for (const obj of page.Contents ?? []) {
    if (!obj.Key.startsWith('backup-') && !obj.Key.endsWith('/')) keys.push(obj.Key);
  }
  continuationToken = page.IsTruncated ? page.NextContinuationToken : undefined;
} while (continuationToken);

const byFolder = {};
for (const key of keys) {
  const folder = key.split('/')[0];
  byFolder[folder] = (byFolder[folder] ?? 0) + 1;
}
console.log(`${keys.length} object(s) outside backup-*:`, byFolder);

if (!apply) {
  // Sample to show what's there now, without touching anything.
  for (const key of keys.slice(0, 3)) {
    const head = await client.send(new HeadObjectCommand({ Bucket, Key: key }));
    console.log(`  sample ${key}: Content-Type=${head.ContentType}, Cache-Control=${head.CacheControl ?? '(none)'}`);
  }
  console.log('Dry run — nothing changed. Re-run with --apply to set the header.');
  process.exit(0);
}

const copySource = (key) => `${Bucket}/${key.split('/').map(encodeURIComponent).join('/')}`;
let updated = 0;
let skipped = 0;
let failed = 0;

async function processKey(key) {
  const head = await client.send(new HeadObjectCommand({ Bucket, Key: key }));
  if (head.CacheControl === S3_CACHE_CONTROL) {
    skipped++;
    return;
  }
  await client.send(
    new CopyObjectCommand({
      Bucket,
      Key: key,
      CopySource: copySource(key),
      MetadataDirective: 'REPLACE',
      CacheControl: S3_CACHE_CONTROL,
      ContentType: head.ContentType,
      ContentDisposition: head.ContentDisposition,
      ContentEncoding: head.ContentEncoding,
      ContentLanguage: head.ContentLanguage,
      Metadata: head.Metadata,
      StorageClass: head.StorageClass,
      ServerSideEncryption: head.ServerSideEncryption,
      // Only re-checks the copy source hasn't changed since the HEAD above.
      CopySourceIfMatch: head.ETag,
    }),
  );
  updated++;
}

// Canary: update one image, then fetch it anonymously the way a shopper's
// browser does. If it isn't still public with the new header, stop before
// touching anything else.
const publicBase = (env.s3PublicBaseUrl || `https://${Bucket}.s3.${env.s3Region}.amazonaws.com`).replace(/\/$/, '');
const canaryKey = keys.find((k) => /^(categories|homepage)\/.+\.webp$/.test(k));
if (!canaryKey) {
  console.error('No categories/ or homepage/ .webp found to use as a canary — stopping.');
  process.exit(1);
}
await processKey(canaryKey);
const canaryRes = await fetch(`${publicBase}/${canaryKey.split('/').map(encodeURIComponent).join('/')}`);
const canaryCc = canaryRes.headers.get('cache-control');
console.log(`Canary ${canaryKey}: HTTP ${canaryRes.status}, Cache-Control=${canaryCc}`);
if (canaryRes.status !== 200 || canaryCc !== S3_CACHE_CONTROL) {
  console.error('Canary failed — the copied image is not publicly readable with the new header. Stopping.');
  process.exit(1);
}

let next = 0;
async function worker() {
  while (next < keys.length) {
    const key = keys[next++];
    try {
      await processKey(key);
    } catch (err) {
      failed++;
      console.error(`  failed ${key}: ${err.name} ${err.message}`);
    }
    const done = updated + skipped + failed;
    if (done % 500 === 0) console.log(`  ...${done}/${keys.length}`);
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, worker));
console.log(`Done: ${updated} updated, ${skipped} already set, ${failed} failed.`);
process.exit(failed > 0 ? 1 : 0);
