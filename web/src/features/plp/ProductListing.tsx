import { useEffect, useRef, useState } from 'react';
import { useInfiniteQuery, useQuery, keepPreviousData } from '@tanstack/react-query';
import { fetchCategoryFilterCounts } from '../../api/categories';
import { PlpProductCard } from '../../components/PlpProductCard';
import { Breadcrumbs, type Crumb } from '../../components/Breadcrumbs';
import { productsQueryKey, fetchProductsPage, getNextProductsPageParam } from './productsQuery';
import { FilterSidebar, type CategoryFilterGroup } from './FilterSidebar';
import { SortSelect } from './SortSelect';
import { SortSheet } from './SortSheet';
import { StickyActionBar } from './StickyActionBar';
import { ActiveFilterChips } from './ActiveFilterChips';
import { QuickAddSheet } from './QuickAddSheet';
import { useQuickAdd } from './useQuickAdd';
import { usePlpFilters } from './usePlpFilters';
import { useHead } from '../../seo/head';
import { breadcrumbJsonLd, organizationJsonLd } from '../../seo/jsonLd';
import styles from './ProductListing.module.css';

interface ProductListingProps {
  categorySlug?: string;
  collectionSlug?: string;
  heading: string;
  description?: string | null;
  breadcrumbs: Crumb[];
  canonicalPath: string;
  subcategories?: { name: string; href: string; slug: string }[];
}

export function ProductListing({
  categorySlug,
  collectionSlug,
  heading,
  description,
  breadcrumbs,
  canonicalPath,
  subcategories,
}: ProductListingProps) {
  const { metal, purity, goldColor, priceMin, priceMax, sort, updateFilters, updateSort, clearFilters } =
    usePlpFilters();
  const [isFilterDrawerOpen, setIsFilterDrawerOpen] = useState(false);
  const [isSortSheetOpen, setIsSortSheetOpen] = useState(false);
  const quickAdd = useQuickAdd();
  const loadMoreRef = useRef<HTMLDivElement>(null);

  const activeFilterCount = [metal, purity, goldColor, priceMin, priceMax].filter((v) => v != null).length;

  useHead({
    title: `${heading} | BOX DIAMONDS`,
    description: description ?? `Shop ${heading} at BOX DIAMONDS — certified, live-priced jewellery.`,
    canonicalPath,
    jsonLd: [
      organizationJsonLd(),
      breadcrumbJsonLd([
        { name: 'Home', path: '/' },
        ...breadcrumbs.map((b) => ({ name: b.label, path: b.href ?? canonicalPath })),
      ]),
    ],
  });

  const filters = { category: categorySlug, collection: collectionSlug, metal, purity, goldColor, priceMin, priceMax, sort };

  const {
    data,
    isLoading,
    isError,
    refetch,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: productsQueryKey(filters),
    queryFn: ({ pageParam }) => fetchProductsPage(filters, pageParam),
    initialPageParam: 1,
    getNextPageParam: getNextProductsPageParam,
    placeholderData: keepPreviousData,
  });

  const products = data ? data.pages.flatMap((p) => p.products) : [];
  const total = data?.pages[0]?.total ?? 0;

  // Fires fetchNextPage() as the sentinel div (placed just past the last
  // row) scrolls into view — the actual "load more on scroll" behavior.
  // Guarded on hasNextPage/isFetchingNextPage so it can't double-fire while
  // a page is already in flight or after the last page has loaded.
  useEffect(() => {
    const el = loadMoreRef.current;
    if (!el) return undefined;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage();
        }
      },
      { rootMargin: '600px 0px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const { data: countsData } = useQuery({
    queryKey: ['category-filter-counts', categorySlug],
    queryFn: () => fetchCategoryFilterCounts(categorySlug as string),
    enabled: !!categorySlug,
    staleTime: 60_000,
  });

  const categoryFilter: CategoryFilterGroup | undefined =
    categorySlug && countsData
      ? {
          currentLabel: heading,
          total: countsData.total,
          items: (subcategories ?? []).map((sc) => ({
            name: sc.name,
            href: sc.href,
            slug: sc.slug,
            count: countsData.subcategories.find((c) => c.slug === sc.slug)?.count ?? 0,
          })),
        }
      : undefined;

  return (
    <div className={styles.page}>
      <div className={styles.top}>
        <Breadcrumbs items={breadcrumbs} />
        <div className={styles.headerRow}>
          <div className={styles.headerLeft}>
            <h1 className={styles.heading}>{heading}</h1>
            {description && <p className={styles.description}>{description}</p>}
            <p className={styles.count} aria-live="polite">
              {data ? `${total} ${total === 1 ? 'Product' : 'Products'}` : ' '}
            </p>
          </div>
          <div className={styles.headerRight}>
            <button
              type="button"
              className={styles.filtersButton}
              onClick={() => setIsFilterDrawerOpen(true)}
            >
              Filters
              {activeFilterCount > 0 && <span className={styles.filtersButtonCount}>{activeFilterCount}</span>}
            </button>
            <SortSelect value={sort} onChange={updateSort} />
          </div>
        </div>

        <ActiveFilterChips values={{ metal, purity, goldColor, priceMin, priceMax }} onChange={updateFilters} />
      </div>

      <div className={styles.layout}>
        <FilterSidebar
          values={{ metal, purity, goldColor, priceMin, priceMax }}
          onChange={updateFilters}
          onClear={clearFilters}
          categoryFilter={categoryFilter}
          isOpen={isFilterDrawerOpen}
          onClose={() => setIsFilterDrawerOpen(false)}
        />

        <div className={styles.results}>
          {isLoading && (
            <div className={styles.grid} aria-busy="true">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className={styles.skeletonCard}>
                  <div className={styles.skeletonImage} />
                  <div className={styles.skeletonLine} style={{ width: '90%' }} />
                  <div className={styles.skeletonLine} style={{ width: '60%' }} />
                  <div className={styles.skeletonLine} style={{ width: '75%', height: 18 }} />
                  <div className={styles.skeletonButton} />
                </div>
              ))}
            </div>
          )}

          {isError && (
            <div className={styles.stateBlock}>
              <p className={styles.message}>Couldn't load products right now.</p>
              <button type="button" className={styles.retryButton} onClick={() => refetch()}>
                Retry
              </button>
            </div>
          )}

          {data && products.length === 0 && (
            <div className={styles.stateBlock}>
              <p className={styles.emptyHeading}>No products found</p>
              <p className={styles.message}>Try adjusting your filters or search.</p>
              <button type="button" className={styles.retryButton} onClick={clearFilters}>
                Clear Filters
              </button>
            </div>
          )}

          {data && products.length > 0 && (
            <>
              <div className={styles.grid}>
                {products.map((product, i) => (
                  <PlpProductCard
                    key={product.id}
                    product={product}
                    index={i}
                    onAddToCart={() => quickAdd.addToCart(product)}
                    isAdding={quickAdd.pendingProductId === product.id}
                    justAdded={quickAdd.justAddedProductId === product.id}
                    hasError={quickAdd.errorProductId === product.id}
                  />
                ))}
              </div>

              {/* Sits just past the last row — the IntersectionObserver above
                  fires fetchNextPage() once this scrolls near the viewport.
                  Stays in the DOM (empty) even with no next page so the ref
                  is always attached. */}
              <div ref={loadMoreRef} className={styles.loadMoreSentinel}>
                {isFetchingNextPage && (
                  <div className={styles.loadingMore} aria-live="polite">
                    <span className={styles.loadingMoreSpinner} aria-hidden="true" />
                    Loading more…
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      <StickyActionBar
        onSort={() => setIsSortSheetOpen(true)}
        onFilter={() => setIsFilterDrawerOpen(true)}
        isSortOpen={isSortSheetOpen}
        isFilterOpen={isFilterDrawerOpen}
        activeFilterCount={activeFilterCount}
      />

      {isSortSheetOpen && (
        <SortSheet value={sort} onChange={updateSort} onClose={() => setIsSortSheetOpen(false)} />
      )}

      {quickAdd.sheetProduct && (
        <QuickAddSheet product={quickAdd.sheetProduct} onClose={quickAdd.closeSheet} />
      )}
    </div>
  );
}
