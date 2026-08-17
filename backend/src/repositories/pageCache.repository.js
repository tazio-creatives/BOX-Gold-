import { query } from '../config/db.js';

// The only writer of DELETEs against page_cache from the backend side —
// web/server owns the read/insert-on-miss path with its own connection
// (plan §1a: "web/server gets its own narrow Postgres connection ...
// nothing else"). Both processes share the same table by design.
export async function invalidatePageCache(urls) {
  const uniqueUrls = [...new Set(urls)].filter(Boolean);
  if (uniqueUrls.length === 0) return;
  await query('DELETE FROM page_cache WHERE url = ANY($1)', [uniqueUrls]);
}
