# Pending releases: SSR product weights and the ₹0 purchase guard

Both are built and verified on staging and **not deployed**. Each is a separate branch off
`ed08be0` (what production runs), so they can be released independently, in either order.

| Release | Branch / commit | Server build | Touches |
|---|---|---|---|
| SSR product weights + admin order weights | `fix/ssr-product-weights` @ `9adcb43` | `~/build-check-9adcb43` | web (2 files), backend (2 files), admin (1 file) |
| ₹0 purchase guard | `fix/zero-price-guard` @ `008cc20` | `~/build-check-008cc20` | backend (3 files), web (6 files) |

No database migrations and no data changes in either.

If both are approved together, merge them first (no overlapping files) and build once from the merge.

## Deployment (per release, after approval)

1. Fresh production backup (`pg_dump | gzip`, `gzip -t`, sha256).
2. Drift check: every file the release changes must md5-match `ed08be0` on the server.
3. Back up those files (`*.bak_<TS>`), copy the release's files with
   `git -c core.autocrlf=false archive <commit> <files> | ssh … tar -x`.
4. Backend: `pm2 reload boxdiamonds-backend`, `GET /api/v1/health` = 200.
5. Admin (SSR release only): `cp -a ~/build-check-9adcb43/admin/dist admin-dist.new`, swap with
   `admin-dist` (keep `admin-dist.bak_<TS>`).
6. Storefront: rebuild into `web/dist.new` from the deployed source, copy old assets in (`cp -n`), render
   a product page from `dist.new/server/entry-server.js` in a fresh process, swap `dist` → `dist.bak_<TS>`,
   `dist.new` → `dist`, `pm2 reload boxdiamonds-web`.
7. `DELETE FROM page_cache`.

### Smoke tests

SSR release:
- `curl https://boxdiamonds.com/daily-use/giardineria-diamond-ring` (no JavaScript): Gold, Net and Gross Weight
  present and equal to `/price-preview` for the default variant.
- Admin → any order → Product Details: Net = Gold Weight, Gross = Gold + Diamond.

Guard release:
- A normal product: Add to Cart and Buy Now work; checkout reaches payment.
- `POST /api/v1/cart/items` for a ₹0 variant (none are published now) returns 409 with the customer message.

## Rollback (per release)

Restore the `*.bak_<TS>` files (and `dist.bak_<TS>` / `admin-dist.bak_<TS>`), `pm2 reload` the affected
apps, `DELETE FROM page_cache`. No database changes to undo.

## Production change already made (approved, 26 Oct 2026)

The four ₹0 products were unpublished (status `PUBLISHED` → `DRAFT`; nothing else changed):
`417afb90-4add-4be1-8b57-27f1d3201a46` (BD-RNG-001558, fiorina-diamond-ring),
`0a445f63-ace7-46dc-8c22-76a6229a21f4` (BD-BRC-001306, lucia-diamond-chain-bracelet),
`fda879e6-2ee6-4364-9555-bafe1b5927c4` (BD-BRC-001400, portofino-diamond-chain-bracelet),
`501495b5-29fd-4a08-a810-4209331e9258` (BD-RNG-002287, test).
Backup: `~/db-backups/db_backup_pre_unpublish_zero_price_20261026-063004.sql.gz`; log:
`~/db-backups/zero-price-unpublish-20261026-063335.log`.

Rollback (only if the business wants them public again, after their prices are fixed):

```sql
BEGIN;
UPDATE products SET status = 'PUBLISHED', updated_at = now()
 WHERE id IN ('417afb90-4add-4be1-8b57-27f1d3201a46','0a445f63-ace7-46dc-8c22-76a6229a21f4',
              'fda879e6-2ee6-4364-9555-bafe1b5927c4','501495b5-29fd-4a08-a810-4209331e9258')
   AND status = 'DRAFT';   -- expect 4 rows
COMMIT;
DELETE FROM page_cache;
```
