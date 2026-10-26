import { fetchProducts, type ListProductsParams } from '../../api/products';
import type { ProductListResponse } from '../../api/types';

// Single source of truth for the PLP's infinite-scroll product query — the
// query key, queryFn, and getNextPageParam here have to be byte-identical
// between the client's useInfiniteQuery (ProductListing.tsx) and the SSR
// prefetch (seo/prefetch.ts), or the server-dehydrated first page silently
// gets refetched on hydration instead of reused (same reasoning as
// parsePlpFilters.ts's own single-source-of-truth comment).
export type ProductsQueryFilters = Omit<ListProductsParams, 'page' | 'limit'>;

// Page 1 keeps its original key (unchanged cache entries); a listing opened
// at ?page=N is its own infinite list starting at N.
export function productsQueryKey(filters: ProductsQueryFilters, startPage = 1) {
  return startPage === 1 ? (['products', filters] as const) : (['products', filters, { startPage }] as const);
}

export function fetchProductsPage(filters: ProductsQueryFilters, pageParam: number) {
  return fetchProducts({ ...filters, page: pageParam, limit: 24 });
}

export function getNextProductsPageParam(lastPage: ProductListResponse): number | undefined {
  return lastPage.page < lastPage.totalPages ? lastPage.page + 1 : undefined;
}

// Everything useInfiniteQuery and the SSR prefetchInfiniteQuery must share.
export function productsQueryOptions(filters: ProductsQueryFilters, startPage = 1) {
  return {
    queryKey: productsQueryKey(filters, startPage),
    queryFn: ({ pageParam }: { pageParam: number }) => fetchProductsPage(filters, pageParam),
    initialPageParam: startPage,
    getNextPageParam: getNextProductsPageParam,
  };
}
