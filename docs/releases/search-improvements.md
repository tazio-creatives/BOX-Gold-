# Pending release: product search improvements

Branch `feature/search-improvements` @ `c90b466` (on top of production `2f10848`). Verified on staging;
**not deployed**. Server build: `~/build-check-c90b466`. No database migrations or data changes.

## Files

| Area | Files |
|---|---|
| Backend | `src/repositories/products.repository.js` (`searchProducts`), `src/services/searchService.js`, `src/controllers/search.controller.js`, `src/validators/search.validators.js` |
| Storefront source | `src/features/search/SearchBar.tsx` + `.module.css`, `src/features/search/searchResultsUrl.ts` (new), `src/features/search/trackSearch.ts` (new), `src/pages/SearchResultsPage.tsx` + `.module.css` (new), `src/App.tsx`, `src/api/search.ts`, `src/api/types.ts`, `src/seo/head.tsx`, `src/seo/renderHeadHtml.ts` |
| Storefront server | `server/index.js` (X-Robots-Tag on `/search`) |
| Tests | `backend/tests/search/productSearch.test.js` (new) |

Admin is unchanged (no admin deploy needed).

## Deployment (after approval)

1. Fresh production backup; drift check: every server file above md5-matches `2f10848`, new files absent.
2. Back up the changed files (`*.bak_<TS>`); copy the release files with
   `git -c core.autocrlf=false archive c90b466 <files> | ssh … tar -x -C ~/boxdiamonds-project`; verify md5.
3. `pm2 reload boxdiamonds-backend`; health 200; `GET /api/v1/search?q=axel` returns `total`.
4. Storefront: `~/build-check-c90b466/web/dist` → `web/dist.new`, `cp -rn` old assets, SSR render test of a
   product page, swap (`dist.bak_<TS>`), `pm2 reload boxdiamonds-web` (also picks up `server/index.js`).
5. `DELETE FROM page_cache`.

## Smoke tests

- Header search: "Axel Gents Diamond Ring" → Axel first; "Gents Diamond Ring" → 8 suggestions + "View all N results".
- Enter opens `/search?q=…`; count, cards, pagination, refresh on page 2.
- `/search?q=qqqzzz` → empty state.
- `curl -I https://boxdiamonds.com/search?q=ring` → `X-Robots-Tag: noindex, follow`; robots.txt still disallows `/search`;
  sitemap has no `/search`.
- A product page and a category page: title/canonical/JSON-LD unchanged; no new errors in pm2 logs.

## Rollback

Restore the backend `.bak_<TS>` files (delete nothing — no new backend files), reload backend; restore
`web/dist.bak_<TS>` and `web/server/index.js.bak_<TS>` plus the storefront source `.bak` files (delete the 4 new
storefront files), reload web; `DELETE FROM page_cache`.
