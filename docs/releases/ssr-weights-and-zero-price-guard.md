# Pending releases: ₹0 purchase guard and SSR product weights

Both are built and verified on staging and **not deployed**. Production runs `ed08be0` (full drift check
26 Oct 2026: every file under backend/src, web/src, web/server, plus web/index.html and the package.json
files, matches it).

| | Release A — ₹0 purchase guard | Release B — SSR product weights |
|---|---|---|
| Branch / commit | `fix/zero-price-guard` @ `008cc20` | `fix/ssr-product-weights` @ `9adcb43` |
| Backend files | `src/services/purchasePriceGuard.js` (new), `src/services/cartService.js`, `src/services/checkoutService.js` | `src/utils/orderDto.js`, `src/repositories/orders.repository.js` |
| Storefront source | `src/utils/purchasable.ts` (new), `src/api/types.ts`, `src/features/pdp/ProductInfo.tsx` + `.module.css`, `src/features/plp/QuickAddSheet.tsx`, `src/pages/CartPage.tsx` + `.module.css` | `src/hooks/useVariantSelection.ts`, `src/seo/prefetch.ts` |
| Admin | — | `src/pages/orders/OrderDetailContent.tsx` (ship the compiled admin) |
| Server build (alone) | `~/build-check-008cc20` | `~/build-check-9adcb43` |
| Backend tests | 217 / 217 | 212 / 212 |
| DB migrations / data changes | none | none |

The two touch no common file and merge cleanly; the merge (`check/combined-release` @ `3b74f02`, check
only) passes 220 / 220 tests and builds web + admin (`~/build-check-3b74f02`).

## Order rule (the storefront is one bundle)

The storefront `dist` is built from the whole `web/src`. So:

- **First release deployed:** build from that release's own commit.
- **Second release deployed:** build from the **merge of both** (fresh merge commit of the two branches),
  or the second build would silently undo the first release's storefront changes.
- **Rolling back one release while keeping the other:** rebuild the storefront from the kept release's
  commit (its prepared `~/build-check-<commit>` works if nothing else changed). Backend and admin files roll
  back independently by restoring their `.bak` copies.

## Common steps (both releases)

1. Fresh production backup: `pg_dump --no-owner "$DB" | gzip > ~/db-backups/db_backup_pre_<release>_<UTC>.sql.gz`,
   `gzip -t`, end-of-dump marker present, `sha256sum` recorded.
2. Drift check: every server file the release changes md5-matches `ed08be0` (or, for the second release,
   the first release's commit); new files absent. Stop on any mismatch.
3. Back up each changed file as `<file>.bak_<TS>`.
4. Copy the release's files: `git -c core.autocrlf=false archive <commit> <files> | ssh … tar -x -C ~/boxdiamonds-project`;
   re-check md5 against the commit.
5. Storefront: copy `~/build-check-<commit>/web/dist` to `web/dist.new`, `cp -rn web/dist/client/assets/* web/dist.new/client/assets/`
   (keeps old hashed assets for open tabs), render one product page from `dist.new/server/entry-server.js`
   in a fresh process (`SSR_API_BASE_URL=http://127.0.0.1:6002/api/v1`), then `mv web/dist web/dist.bak_<TS>`,
   `mv web/dist.new web/dist`, `pm2 reload boxdiamonds-web`.
6. `DELETE FROM page_cache` after the last reload.
7. Watch `pm2 logs` for 10 minutes.

## Release A — ₹0 purchase guard: deployment checklist

- [ ] Steps 1–3 for the 3 backend files and the 7 storefront source files (keep the source on the server
      in step with what was built).
- [ ] Copy backend files; `pm2 reload boxdiamonds-backend`; `GET /api/v1/health` = 200.
- [ ] Storefront swap (step 5) from `~/build-check-008cc20` (or the merge build if B is already live).
- [ ] `DELETE FROM page_cache`.

### Release A smoke tests

- [ ] Normal product page: Add to Cart and Buy Now enabled; add to cart works (guest).
- [ ] Cart page loads; Proceed to Checkout enabled; checkout page loads with the item.
- [ ] `POST /api/v1/cart/items` (header `X-Requested-With: box-diamonds`) for a normal variant → 200.
- [ ] No ₹0 product is published (`SELECT count(*) FROM products WHERE status='PUBLISHED' AND NOT selling_price > 0` = 0),
      so the guard's refusal path can't be exercised in production without a test product — it is covered
      by the staging tests (alone, mixed, existing cart, Buy Now, manipulated payload).
- [ ] No new errors in `pm2 logs boxdiamonds-backend --err`.
- [ ] Do **not** place a real order; payment flow is unchanged by this release.

### Release A rollback

Restore the 2 backend `.bak` files and delete `purchasePriceGuard.js`; reload backend. Restore
`web/dist.bak_<TS>` (or rebuild from the kept release); reload web; `DELETE FROM page_cache`.

## Release B — SSR product weights: deployment checklist

- [ ] Steps 1–3 for the 2 backend files and the 2 storefront source files.
- [ ] Copy backend files; `pm2 reload boxdiamonds-backend`; health 200.
- [ ] Admin: `cp -a ~/build-check-9adcb43/admin/dist admin-dist.new` (or the merge build),
      `mv admin-dist admin-dist.bak_<TS>`, `mv admin-dist.new admin-dist`.
- [ ] Storefront swap (step 5) from `~/build-check-9adcb43` (or the merge build if A is already live).
- [ ] `DELETE FROM page_cache`.

### Release B smoke tests

- [ ] `curl -s https://boxdiamonds.com/daily-use/giardineria-diamond-ring` (no JavaScript): Gold, Net,
      Natural Diamond and Gross Weight rows present; Gold = `/price-preview` gold for the default variant;
      Gross = Gold + Diamond.
- [ ] Same for `/bracelets/anima-diamond-chain-bracelet` (expected today ≈ 1.475 / 1.475 / 0.020 / 1.495 g).
- [ ] Re-run the all-products check (server HTML weights = pricing engine for the default variant) against
      production: expect 1,284 of 1,284 published products.
- [ ] Browser: switching 9K ↔ 18K and size still updates weights and price.
- [ ] Admin → an existing order → Product Details: Net = Gold Weight, Gross = Gold + Diamond.
- [ ] Response time of an uncached product page within ~10 ms of before.

### Release B rollback

Restore the 2 backend `.bak` files; reload backend. Restore `admin-dist.bak_<TS>`. Restore
`web/dist.bak_<TS>` (or rebuild from the kept release); reload web; `DELETE FROM page_cache`.

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

## Not part of either release

- `backend/scripts/setS3CacheControl.js` on the server is a newer, uncommitted version (18 Oct, with
  snapshot/pilot/rollback). Neither release copies it; it should be committed to git separately.
- Product data corrections: see `product-data-corrections-proposal.md` (proposal only).
