# Permanent SKU — production deployment and rollback runbook

Commit: `ed08be0` on `feature/permanent-sku` (bundle `box-gold-permanent-sku-ed08be0.bundle`,
sha256 `5644a556…f933892`, on the server at `~/box-gold-permanent-sku-ed08be0.bundle`).
Status: **prepared and rehearsed on a staging copy — NOT approved for production.**

## What changes

| Part | Change | Production impact |
|---|---|---|
| Migration `20261026000000_permanent_product_sku` | adds `products.jewellery_type`, `products.legacy_sku` (+ partial unique index), sequence `product_sku_seq` (starts 1001) | additive; old code keeps working with it |
| Backend (8 files) | SKU assigned by the server on create (`BD-{TYPE}-{NNNNNN}`), permanent on update, admin search also matches `legacy_sku` | pm2 reload of `boxdiamonds-backend` |
| Admin (compiled) | jewellery type required on create, SKU read-only, Save / Start AI Generation / Start Manual Upload locked while any is in flight | replace `admin-dist` |
| Storefront | **no source change** | no rebuild; page cache purge only |
| Data script `scripts/migrateDraftSkus.js` + `sku-type-decisions.json` | moves the reviewed DRAFT codes to permanent codes, old code kept as `legacy_sku` | run once, after approval |

Never touched: `order_items.product_sku` (frozen on every order line), orders, payments, invoices,
prices, variants, gold weights, stock, images, product ids, slugs/URLs, SEO fields, redirects.

## Reviewed plan (fresh snapshot 25 Oct 2026 10:44 UTC)

1,293 products · 1,287 DRAFT codes · 6 manual codes · 3 orders.

- Migrate **1,286** (1,284 published + 2 draft): RING 550 · PENDANT 181 · BRACELET 158 ·
  NECKLACE 144 · EARRINGS 121 · BANGLE 81 · MANGALSUTRA 51 — numbers 001001–002286.
- Jewellery types stored: **1,289** (1,286 + 3 manual-code products that only get a type).
- Excluded: `payment-test-live` (stays `DRAFT-1790013449236`, not modified).
- Manual codes preserved: BD-RING-0001, BD-EARR-0001, BD-RING-0004, BD-NECK-0001, SKU3450, bx234.
- Apply flags: `--expect-skus=1286 --expect-types=1289`.

## Deployment sequence (only after explicit approval)

Low-traffic window. Admins must not create or edit products from step 3 until step 8 is done, and
must reload the admin after step 5 (an old admin tab still sends `DRAFT-…` codes).

1. **Backup**: `pg_dump --no-owner "$DB" | gzip > ~/db-backups/db_backup_pre_sku_go_live_<UTC>.sql.gz`,
   `gzip -t`, record `sha256sum`.
2. **Drift check**: the 7 existing backend files must md5-match `f9ec0ef`; the 3 new files must be
   absent. Stop on any mismatch.
3. **Backend files**: back up the 7 files (`*.bak_<TS>`), then
   `git -c core.autocrlf=false archive ed08be0 <backend files> | ssh … tar -x -C ~/boxdiamonds-project`.
4. **Schema**: `cd backend && npm run migrate:up` — expect only `20261026000000_permanent_product_sku`.
   Then `pm2 reload boxdiamonds-backend`; `GET /api/v1/health` 200.
5. **Admin**: `cp -a ~/build-check-ed08be0/admin/dist ~/boxdiamonds-project/admin-dist.new`,
   `mv admin-dist admin-dist.bak_<TS>`, `mv admin-dist.new admin-dist`.
6. **Dry run**: `node scripts/migrateDraftSkus.js --out=~/db-backups/sku-migration`. It must say
   1,286 / 1,289 / excluded 1 / on hold 0. **Any difference → stop and report** (do not force the counts).
   Keep its mapping CSV — it is the old→new record.
7. **Apply**: `node scripts/migrateDraftSkus.js --apply --expect-skus=1286 --expect-types=1289 --out=~/db-backups/sku-migration`.
   One transaction; aborts and changes nothing on any mismatch. Writes the change log (needed for
   rollback) and clears `page_cache`.
8. **Verify** (read-only SQL): every migrated row matches `^BD-[A-Z]{3}-\d{6}$` and its prefix matches
   its type; no duplicate SKUs or numbers; 1,286 distinct `legacy_sku`; the 6 manual codes and
   `payment-test-live` unchanged; `order_items` fingerprint unchanged.

### Cache invalidation

- `page_cache` (SSR HTML, 600 s TTL) is cleared by the apply step; clear it again
  (`DELETE FROM page_cache`) after step 5 if the apply was not run straight after.
- Admin assets are content-hashed; admins reload once to pick up the new `index.html`.
- No CDN, Meta catalogue or feed to refresh (there is no active Meta product catalogue).

### Smoke tests after go-live

1. `/…/serenevia-diamond-ring` (same URL) shows SKU `BD-BRC-001328` in the details list and in the
   Product JSON-LD `sku`; canonical, title and meta description unchanged.
2. Admin product search finds Roma by `BD-BRC-001226` and by `DRAFT-1788152171811`.
3. Admin Add Product: SKU field read-only "Assigned automatically on save"; jewellery type required;
   clicking Save / Start AI Generation / Start Manual Upload disables all three until it finishes.
4. An existing order in admin and My Orders still shows its original `DRAFT-…` code.
5. Add to cart + checkout page load on a migrated product; Buy Now opens checkout.
6. pm2 logs: no new errors for 10 minutes.

## Rollback

Do **not** restore the pre-deploy database dump — that would erase orders, payments and tracking
records created after go-live. Roll back in place instead:

1. **Code only** (keep the new SKUs): restore the 7 backend `*.bak_<TS>` files, delete the 3 new
   files, `pm2 reload boxdiamonds-backend`, swap `admin-dist.bak_<TS>` back, clear `page_cache`.
   Safe because the migration is additive and the old admin resends the product's current SKU.
2. **Data** (back to DRAFT codes) — with the new backend code still in place:
   `node scripts/migrateDraftSkus.js --restore=<change log>`. It restores SKU and `legacy_sku` for
   exactly the logged products in one transaction (aborts on any mismatch), keeps any jewellery type
   an admin changed after go-live, and never touches `order_items`. Clear `page_cache`.
3. **Schema** (optional, after 2): `npm run migrate:down` once. It refuses while any `legacy_sku`
   exists, so it can't lose the old codes.

What stays after a rollback, by design:

- Products **created after go-live** keep their `BD-…` codes (they never had a DRAFT code); those
  are valid, unique SKUs under the old code too.
- Orders placed after go-live keep the `BD-…` code frozen on their lines; invoices, work orders,
  shipping and returns read that frozen value, so they stay consistent.
- GA4 / Meta Pixel / CAPI events already sent carry `BD-…` item ids; they cannot be recalled. Join
  them to old codes with the mapping CSV / change log. Browser and server Purchase share
  `event_id = order_<id>`, so de-duplication is unaffected.

Rehearsed on a staging copy of the fresh snapshot, including post-go-live products, an order and an
admin type edit: restore → original 1,293 rows byte-identical to production (sku and all other
columns), down → columns and sequence removed.
