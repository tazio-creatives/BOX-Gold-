import { matchPath } from 'react-router-dom';
import type { QueryClient, QueryKey } from '@tanstack/react-query';
import { ApiError } from '../api/client';
import { fetchHomepage } from '../api/homepage';
import { fetchCategories } from '../api/categories';
import { fetchCollectionBySlug } from '../api/collections';
import { fetchProducts, fetchProductBySlug } from '../api/products';
import { parsePlpFilters } from '../features/plp/parsePlpFilters';
import type { Category } from '../api/types';

// Prefetches the exact same TanStack Query key + data each of the 4 SSR
// page components fetches client-side (plan §1a) — the query key has to
// match exactly (see parsePlpFilters) for dehydrate/hydrate to actually
// avoid a client refetch, not just look similar.
export async function prefetchForRoute(
  queryClient: QueryClient,
  url: string,
): Promise<{ notFound: boolean }> {
  const { pathname, searchParams } = new URL(url, 'http://internal');

  if (pathname === '/') {
    await safePrefetch(queryClient, ['homepage'], fetchHomepage);
    return { notFound: false };
  }

  const collectionMatch = matchPath('/collections/:collectionSlug', pathname);
  if (collectionMatch) {
    const collectionSlug = collectionMatch.params.collectionSlug as string;
    const notFound = await fetchPrimary(queryClient, ['collection', collectionSlug], () =>
      fetchCollectionBySlug(collectionSlug),
    );
    if (!notFound) {
      const filters = parsePlpFilters(searchParams);
      await safePrefetch(queryClient, ['products', { collectionSlug, ...filters }], () =>
        fetchProducts({ collection: collectionSlug, ...filters, limit: 24 }),
      );
    }
    return { notFound };
  }

  const pdpMatch = matchPath('/:categorySlug/:productSlug', pathname);
  if (pdpMatch) {
    const productSlug = pdpMatch.params.productSlug as string;
    const notFound = await fetchPrimary(queryClient, ['product', productSlug], () =>
      fetchProductBySlug(productSlug),
    );
    await safePrefetch(queryClient, ['categories'], fetchCategories);
    return { notFound };
  }

  const plpMatch = matchPath('/:categorySlug', pathname);
  if (plpMatch) {
    const categorySlug = plpMatch.params.categorySlug as string;
    await safePrefetch(queryClient, ['categories'], fetchCategories);
    const categoriesData = queryClient.getQueryData<{ categories: Category[] }>(['categories']);
    const exists = categoriesData?.categories.some((c) => c.slug === categorySlug) ?? false;
    if (!exists) return { notFound: true };

    const filters = parsePlpFilters(searchParams);
    await safePrefetch(queryClient, ['products', { categorySlug, ...filters }], () =>
      fetchProducts({ category: categorySlug, ...filters, limit: 24 }),
    );
    return { notFound: false };
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
