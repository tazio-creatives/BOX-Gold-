# Pending release: crawlable listing pagination (SEO #9)

Branch `feature/crawlable-pagination` @ `8e8f952` (on top of production `a5450d6`). Verified on staging; **not
deployed**. Server build: `~/build-check-8e8f952`. Storefront only, with no backend, admin, server, database,
sitemap or data changes.

## What changes

- Plain category, collection, `/new-arrivals` and `/jewellery` listings accept `?page=N`. The server renders that
  page's 24 products, and infinite scroll continues from N+1.
- Server HTML has Previous / numbered / Next links (`rel="prev"` / `rel="next"`) below the grid.
- Canonical: page 1 and `?page=1` → base URL. Page N → `base?page=N`. Title gets "– Page N".
- `?page=` beyond the last page → HTTP 404, "This page doesn't exist", base canonical, `noindex, follow`. These
  pages are not written to `page_cache`.
- Filtered or re-sorted views keep the canonical to the base URL and show no page links. Changing a filter or
  sort drops `?page`.
- Sitemap unchanged (pagination URLs not added). Product pages are byte-identical to the current build.

Files (all `web/`):
- `src/components/Pagination.tsx`
- `src/components/pageNumbers.ts` (new)
- `src/features/plp/ListingPageLinks.tsx` (new)
- `src/features/plp/ProductListing.module.css`
- `src/features/plp/ProductListing.tsx`
- `src/features/plp/parsePlpFilters.ts`
- `src/features/plp/productsQuery.ts`
- `src/features/plp/usePlpFilters.ts`
- `src/seo/prefetch.ts`

## Deployment (after approval)

1. Drift check: the 9 paths above (7 existing, 2 new/absent) md5-match `a5450d6` on the server.
2. Back up the 7 existing files as `.bak_<TS>`. Copy the 9 files from `8e8f952` (`git -c core.autocrlf=false
   archive`) and verify their md5s.
3. Storefront:
   1. Copy `~/build-check-8e8f952/web/dist` to `web/dist.new`, then `cp -rn` the old assets into it.
   2. SSR render test of `/gents?page=2` and a product page.
   3. Swap `web/dist` to `web/dist.bak_<TS>` and put `dist.new` in its place.
   4. `pm2 reload boxdiamonds-web`.
4. `DELETE FROM page_cache`.
5. No backend reload needed.

## Smoke tests

- `curl https://boxdiamonds.com/gents?page=2` checks:
  - HTTP 200;
  - 24 product links, different from page 1;
  - canonical `https://boxdiamonds.com/gents?page=2`;
  - `rel="prev"` and `rel="next"` present.
- `/gents?page=1` canonical is `/gents`. `/gents?page=99` returns 404. `/gents?sort=newest&page=2` canonical is
  `/gents` with no page links.
- Browser, desktop and mobile:
  - infinite scroll on `/gents` reaches all products with no repeats;
  - page links work;
  - refresh on `?page=3` works;
  - quick-add works;
  - no React hydration errors.
- HTML-only crawl from `/` reaches all categorised published products.

## Rollback

1. Restore `web/dist.bak_<TS>` and the 7 `.bak_<TS>` source files.
2. Delete `web/src/components/pageNumbers.ts` and `web/src/features/plp/ListingPageLinks.tsx`.
3. `pm2 reload boxdiamonds-web`.
4. `DELETE FROM page_cache`.

Already-crawled `?page=N` URLs would then serve page 1 with a canonical to the base URL, which is the current
behaviour.

## Known exception (data, not code)

Sarielle Diamond Pendant (`BD-PND-001902`) is published with no category:
- its listing card links to `/sarielle-diamond-pendant`, which returns 404;
- it's missing from the sitemap and from HTML-only crawls.

A one-field correction is proposed separately and awaits approval.
