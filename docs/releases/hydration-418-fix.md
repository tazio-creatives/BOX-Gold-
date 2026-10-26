# Pending release: React #418 fix (client-only pages)

Branch `fix/hydration-418` @ `a5450d6` (on top of production `c90b466`). Verified on staging; **not deployed**.
Server build: `~/build-check-a5450d6`. One file changed: `web/src/entry-client.tsx`. No backend, admin,
server, database or data changes.

## Deployment (after approval)

1. Drift check: server `web/src/entry-client.tsx` md5-matches `c90b466` (and the rest of the tree as usual).
2. `cp -p web/src/entry-client.tsx web/src/entry-client.tsx.bak_<TS>`; copy the file from `a5450d6`; verify md5.
3. Storefront: `~/build-check-a5450d6/web/dist` → `web/dist.new`, `cp -rn` old assets, SSR render test of a
   product page, swap (`web/dist` → `web/dist.bak_<TS>`), `pm2 reload boxdiamonds-web`.
4. `DELETE FROM page_cache`.
5. No backend reload needed.

## Smoke tests

- Direct load + refresh of `/cart`, `/wishlist`, `/search?q=ring`, `/checkout`, `/account/orders`: no React #418
  (browser console).
- Product, category and home pages: server HTML present (curl shows content inside `#root`), title/canonical/JSON-LD
  unchanged.
- Add to cart, cart page, search "View all" still work.

## Rollback

Restore `web/dist.bak_<TS>` and `web/src/entry-client.tsx.bak_<TS>`, `pm2 reload boxdiamonds-web`,
`DELETE FROM page_cache`.
