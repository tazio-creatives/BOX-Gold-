import { invalidatePageCache } from '../repositories/pageCache.repository.js';
import { findCategoryById } from '../repositories/categories.repository.js';

// Every mutation that can change what a public SSR page (plan §1a: Home,
// PLP/category, Collections, PDP) would render calls one of these so the
// Postgres-backed page_cache never serves stale HTML past the next request
// for that URL — the SSR_CACHE_TTL_SECONDS window bounds staleness even if
// a call site is ever missed, but this is what makes edits feel instant.

// product rows here are the raw repository shape (snake_case: category_id,
// slug) — same shape returned by products.repository.js everywhere.
export async function invalidateProductPages(product, previousCategoryId) {
  const urls = ['/'];
  if (product.category_id) {
    const category = await findCategoryById(product.category_id);
    if (category) {
      urls.push(`/${category.slug}`, `/${category.slug}/${product.slug}`);
    }
  }
  if (previousCategoryId && previousCategoryId !== product.category_id) {
    const oldCategory = await findCategoryById(previousCategoryId);
    if (oldCategory) urls.push(`/${oldCategory.slug}`);
  }
  await invalidatePageCache(urls);
}

// Bulk variant for the rate-sync recalculation jobs (plan §9a), which can
// touch many products in one pass — one DELETE at the end instead of one
// per product, with category slugs resolved at most once each.
export async function invalidateProductsPagesBatch(products) {
  const urls = new Set(['/']);
  const categoryCache = new Map();

  for (const product of products) {
    if (!product.category_id) continue;
    if (!categoryCache.has(product.category_id)) {
      categoryCache.set(product.category_id, await findCategoryById(product.category_id));
    }
    const category = categoryCache.get(product.category_id);
    if (!category) continue;
    urls.add(`/${category.slug}`);
    urls.add(`/${category.slug}/${product.slug}`);
  }

  await invalidatePageCache([...urls]);
}

export async function invalidateCategoryPages(category, previousSlug) {
  const urls = ['/', `/${category.slug}`];
  if (previousSlug && previousSlug !== category.slug) urls.push(`/${previousSlug}`);
  if (category.parent_id) {
    const parent = await findCategoryById(category.parent_id);
    if (parent) urls.push(`/${parent.slug}`);
  }
  await invalidatePageCache(urls);
}

export async function invalidateCollectionPages(collection, previousSlug) {
  const urls = ['/', `/collections/${collection.slug}`];
  if (previousSlug && previousSlug !== collection.slug) urls.push(`/collections/${previousSlug}`);
  await invalidatePageCache(urls);
}
