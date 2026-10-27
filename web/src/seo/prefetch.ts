import { matchPath } from 'react-router-dom';
import type { InfiniteData, QueryClient, QueryKey } from '@tanstack/react-query';
import { ApiError } from '../api/client';
import { fetchHomepage } from '../api/homepage';
import { fetchCategories, fetchFilterOptions } from '../api/categories';
import { fetchCollectionBySlug } from '../api/collections';
import { fetchProductBySlug, fetchVariantPricePreview } from '../api/products';
import { parsePlpFilters, parsePlpPage } from '../features/plp/parsePlpFilters';
import { productsQueryOptions, type ProductsQueryFilters } from '../features/plp/productsQuery';
import type { Category, ProductDetail, ProductListResponse } from '../api/types';
import {
  getDefaultVariantId,
  pricePreviewQueryKey,
  variantPreferenceFromSearchParams,
} from '../hooks/useVariantSelection';
import { fetchBlogPosts, fetchBlogPost, blogListQueryKey, blogPostQueryKey } from '../api/blog';

// Prefetches the exact same TanStack Query key + data each of the 4 SSR
// page components fetches client-side (plan §1a) — the query key has to
// match exactly (see parsePlpFilters) for dehydrate/hydrate to actually
// avoid a client refetch, not just look similar.
const STATIC_PAGE_PATHS = new Set([
  '/retail-partner',
  '/franchise',
  '/faqs',
  '/shipping-policy',
  '/refund-policy',
  '/return-policy',
  '/contact',
  '/our-story',
  '/why-box-diamonds',
  '/privacy-policy',
  '/terms',
  '/care-guide',
  '/sustainability',
]);

export async function prefetchForRoute(
  queryClient: QueryClient,
  url: string,
): Promise<{ notFound: boolean }> {
  const { pathname, searchParams } = new URL(url, 'http://internal');

  // The header's mega menu needs the category tree on every route, not just
  // PLP/PDP (which already prefetched it for their own breadcrumbs/grid) —
  // safePrefetch is a no-op if a route below prefetches the same key again.
  await safePrefetch(queryClient, ['categories'], fetchCategories);

  if (pathname === '/') {
    await safePrefetch(queryClient, ['homepage'], fetchHomepage);
    return { notFound: false };
  }

  if (pathname === '/blog') {
    const page = Math.max(1, Number(searchParams.get('page')) || 1);
    await safePrefetch(queryClient, [...blogListQueryKey(page)], () => fetchBlogPosts(page));
    return { notFound: false };
  }

  const blogPostMatch = matchPath('/blog/:slug', pathname);
  if (blogPostMatch) {
    const slug = blogPostMatch.params.slug as string;
    const notFound = await fetchPrimary(queryClient, [...blogPostQueryKey(slug)], () => fetchBlogPost(slug));
    return { notFound };
  }

  const collectionMatch = matchPath('/collections/:collectionSlug', pathname);
  if (collectionMatch) {
    const collectionSlug = collectionMatch.params.collectionSlug as string;
    const notFound = await fetchPrimary(queryClient, ['collection', collectionSlug], () =>
      fetchCollectionBySlug(collectionSlug),
    );
    if (notFound) return { notFound };
    const filters = { collection: collectionSlug, ...parsePlpFilters(searchParams) };
    return { notFound: await safePrefetchProducts(queryClient, filters, parsePlpPage(searchParams)) };
  }

  if (pathname === '/new-arrivals' || pathname === '/jewellery') {
    const filters = parsePlpFilters(searchParams);
    return { notFound: await safePrefetchProducts(queryClient, filters, parsePlpPage(searchParams)) };
  }

  // Static landing/content pages that share the one-segment URL shape with
  // categories — server-rendered, nothing to prefetch, never a 404.
  if (STATIC_PAGE_PATHS.has(pathname)) return { notFound: false };

  const pdpMatch = matchPath('/:categorySlug/:productSlug', pathname);
  if (pdpMatch) {
    const productSlug = pdpMatch.params.productSlug as string;
    const notFound = await fetchPrimary(queryClient, ['product', productSlug], () =>
      fetchProductBySlug(productSlug),
    );
    await safePrefetch(queryClient, ['categories'], fetchCategories);
    // The opening variant's price and weights (the default one, or the
    // ?purity=&colour= one a catalogue link asks for) from the same
    // price-preview endpoint the page uses after every selection — so the
    // first HTML already shows them instead of the product-level fallback.
    const product = queryClient.getQueryData<{ product: ProductDetail }>(['product', productSlug])?.product;
    const variantId = product ? getDefaultVariantId(product, variantPreferenceFromSearchParams(searchParams)) : null;
    if (product && variantId) {
      await safePrefetch(queryClient, pricePreviewQueryKey(product.id, variantId), () =>
        fetchVariantPricePreview(product.id, { variantId }),
      );
    }
    return { notFound };
  }

  const plpMatch = matchPath('/:categorySlug', pathname);
  if (plpMatch) {
    const categorySlug = plpMatch.params.categorySlug as string;
    await safePrefetch(queryClient, ['categories'], fetchCategories);
    const categoriesData = queryClient.getQueryData<{ categories: Category[] }>(['categories']);
    const exists = categoriesData?.categories.some((c) => c.slug === categorySlug) ?? false;
    if (!exists) return { notFound: true };

    const filters = { category: categorySlug, ...parsePlpFilters(searchParams) };
    return { notFound: await safePrefetchProducts(queryClient, filters, parsePlpPage(searchParams)) };
  }

  return { notFound: false };
}

// Primary resource for the page (product/collection) — a 404 here means the
// whole route is not-found, so it's reported back to the render host to set
// the real HTTP status. Non-404 errors bubble up so the caller falls back
// to the minimal shell rather than serving a half-rendered page.
async function fetchPrimary<T>(
  queryClient: QueryClient,
  queryKey: QueryKey,
  queryFn: () => Promise<T>,
): Promise<boolean> {
  try {
    await queryClient.fetchQuery({ queryKey, queryFn });
    return false;
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return true;
    throw err;
  }
}

// Secondary/supporting data (categories for breadcrumbs, the product grid
// on a PLP) — best-effort. If it fails the page still renders, just without
// that piece pre-hydrated, and the client fetches it normally.
async function safePrefetch<T>(
  queryClient: QueryClient,
  queryKey: QueryKey,
  queryFn: () => Promise<T>,
): Promise<void> {
  try {
    await queryClient.prefetchQuery({ queryKey, queryFn });
  } catch {
    // intentionally swallowed
  }
}

// The PLP grid is an infinite-scroll query client-side (productsQuery.ts) —
// this has to prefetch the same shape (prefetchInfiniteQuery, not
// prefetchQuery) with the same key/queryFn/getNextPageParam, or the
// dehydrated first page comes back as the wrong cache shape and the client
// silently refetches from scratch on hydration instead of reusing it. Only
// the requested page (?page=N, default 1) is fetched server-side — scrolling
// further is a client-only concern. Returns true (-> HTTP 404) when ?page=N
// is past the last page of a listing.
async function safePrefetchProducts(
  queryClient: QueryClient,
  filters: ProductsQueryFilters,
  startPage = 1,
): Promise<boolean> {
  // Every product listing shows the filter sidebar — its options too.
  await safePrefetch(queryClient, ['filter-options'], fetchFilterOptions);
  try {
    const options = productsQueryOptions(filters, startPage);
    await queryClient.prefetchInfiniteQuery(options);
    const first = queryClient.getQueryData<InfiniteData<ProductListResponse>>(options.queryKey)?.pages[0];
    return startPage > 1 && !!first && startPage > first.totalPages;
  } catch {
    // intentionally swallowed
    return false;
  }
}
