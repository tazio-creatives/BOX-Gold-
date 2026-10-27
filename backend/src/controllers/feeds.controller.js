import crypto from 'node:crypto';
import { env } from '../config/env.js';
import { getCatalogProducts } from '../services/metaCatalogService.js';
import { buildFeedItems, renderFeedXml } from '../services/metaCatalogFeed.js';

// Meta re-reads the feed hourly; building it prices every published variant,
// so one build is shared for 15 minutes (per process) — and concurrent
// requests while a build runs wait for that same build, never start another.
const CACHE_TTL_MS = 15 * 60 * 1000;
let cachedFeed = null;
let pendingBuild = null;

async function buildFeed() {
  const products = await getCatalogProducts();
  const siteUrl = env.webAppBaseUrl.replace(/\/+$/, '');
  const { items, skipped, warnings } = buildFeedItems(products, { siteUrl });
  return {
    builtAt: new Date(),
    xml: renderFeedXml(items, { siteUrl }),
    report: { products: products.length, items: items.length, skipped, warnings },
  };
}

async function getFeed() {
  if (cachedFeed && Date.now() - cachedFeed.builtAt.getTime() < CACHE_TTL_MS) return cachedFeed;
  if (!pendingBuild) {
    pendingBuild = buildFeed()
      .then((feed) => {
        cachedFeed = feed;
        if (feed.report.skipped.length > 0) {
          console.warn(
            `[meta-catalog] ${feed.report.skipped.length} item(s) skipped — see ?report=`,
          );
        }
        return feed;
      })
      .finally(() => {
        pendingBuild = null;
      });
  }
  return pendingBuild;
}

function isReportKey(given) {
  const key = env.metaFeedReportKey;
  if (!key || typeof given !== 'string') return false;
  const a = Buffer.from(given);
  const b = Buffer.from(key);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// GET /feeds/meta-catalog.xml — the scheduled data feed URL given to Meta
// Commerce Manager. ?report=<META_FEED_REPORT_KEY> returns the JSON health
// report (item count, skipped products and why, data warnings) instead.
export async function metaCatalog(req, res, next) {
  try {
    const feed = await getFeed();
    if (isReportKey(req.query.report)) {
      res.set('Cache-Control', 'no-store').json({ builtAt: feed.builtAt, ...feed.report });
      return;
    }
    res
      .status(200)
      .set('Content-Type', 'application/xml; charset=utf-8')
      .set('Cache-Control', 'public, max-age=900')
      .send(feed.xml);
  } catch (err) {
    next(err);
  }
}
