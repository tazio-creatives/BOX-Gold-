import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useInfiniteQuery, useQuery, keepPreviousData } from '@tanstack/react-query';
import { fetchCategoryFilterCounts } from '../../api/categories';
import type { CategoryBanner as CategoryBannerData } from '../../api/types';
import { PlpProductCard } from '../../components/PlpProductCard';
import { Breadcrumbs, type Crumb } from '../../components/Breadcrumbs';
import { CategoryBanner } from './CategoryBanner';
import { productsQueryOptions } from './productsQuery';
import { ListingPageLinks } from './ListingPageLinks';
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
  // Short label (breadcrumbs, filters, "All Rings")…
  heading: string;
  // …vs. the page's H1 / SEO wording ("Natural Diamond Rings").
  h1?: string;
  seoTitle?: string | null;
  seoDescription?: string | null;
  // Short visible intro under the heading (category description).
  description?: string | null;
  breadcrumbs: Crumb[];
  canonicalPath: string;
  subcategories?: { name: string; href: string; slug: string }[];
  // Category-only — collection/new-arrivals pages never pass this, and keep
  // their existing plain <h1> heading exactly as before. When present, this
  // banner's own <h1> is the page's only heading (see render below).
  banner?: CategoryBannerData | null;
}

// Collection/category names like "For Him" or "Gents" made 20-character
// titles ("Gents | BOX DIAMONDS") that say nothing about what's sold — SEO
// audits flag anything under ~30 characters. Short names get the product
// type spelled out; longer ones are left as they are.
function listingTitle(h1: string): string {
  const plain = `${h1} | BOX DIAMONDS`;
  return plain.length >= 30 || /diamond/i.test(h1) ? plain : `${h1} | Natural Diamond Jewellery | BOX DIAMONDS`;
}

// "Gents | BOX DIAMONDS" -> "Gents – Page 2 | BOX DIAMONDS": every page of a
// listing gets its own title.
function pagedTitle(title: string, page: number): string {
  const suffix = ' | BOX DIAMONDS';
  return title.endsWith(suffix) ? `${title.slice(0, -suffix.length)} – Page ${page}${suffix}` : `${title} – Page ${page}`;
}

export function ProductListing({
  categorySlug,
  collectionSlug,
  heading,
  h1 = heading,
  seoTitle,
  seoDescription,
  description,
  breadcrumbs,
  canonicalPath,
  subcategories,
  banner,
}: ProductListingProps) {
  const { metal, purity, goldColor, priceMin, priceMax, sort, page, updateFilters, updateSort, clearFilters } =
    usePlpFilters();
  const [isFilterDrawerOpen, setIsFilterDrawerOpen] = useState(false);
  const [isSortSheetOpen, setIsSortSheetOpen] = useState(false);
  const quickAdd = useQuickAdd();
  const loadMoreRef = useRef<HTMLDivElement>(null);

  const activeFilterCount = [metal, purity, goldColor, priceMin, priceMax].filter((v) => v != null).length;
  // Crawlable pagination (?page=N) belongs to the plain listing only: filtered
  // or re-sorted views keep their canonical to the base URL and get no page
  // links, so no endless filter/sort/page URL combinations become crawlable.
  const isPlainListing = activeFilterCount === 0 && sort === 'featured';
  const baseTitle = seoTitle || listingTitle(h1);

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
    // Starts at ?page=N (the server rendered that page); scrolling then
    // appends N+1, N+2… — contiguous pages, so nothing repeats or is skipped.
    ...productsQueryOptions(filters, page),
    placeholderData: keepPreviousData,
  });

  const products = data ? data.pages.flatMap((p) => p.products) : [];
  const total = data?.pages[0]?.total ?? 0;
  const totalPages = data?.pages[0]?.totalPages ?? 0;
  // The page links count from the last page actually on screen, so after
  // scrolling has loaded pages N…M, "Next" is M+1 (never a page already shown).
  const lastLoadedPage = data?.pages[data.pages.length - 1]?.page ?? page;
  // ?page=N past the last page: the server answers 404 (prefetch.ts), and the
  // page says so instead of "No products found" under a "Page N" title.
  const isPastLastPage = page > 1 && !!data && page > totalPages;
  const isPagedUrl = isPlainListing && page > 1 && !isPastLastPage;

  useHead({
    title: isPagedUrl ? pagedTitle(baseTitle, page) : baseTitle,
    description: seoDescription || description || `Shop ${heading} at BOX DIAMONDS — certified, live-priced jewellery.`,
    canonicalPath: isPagedUrl ? `${canonicalPath}?page=${page}` : canonicalPath,
    robots: isPastLastPage ? 'noindex, follow' : undefined,
    jsonLd: [
      organizationJsonLd(),
      breadcrumbJsonLd([
        { name: 'Home', path: '/' },
        ...breadcrumbs.map((b) => ({ name: b.label, path: b.href ?? canonicalPath })),
      ]),
    ],
  });

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

  const showBanner = !!banner?.imageUrl;
  // The desktop image is the required "master" — no desktop banner means no
  // banner area on mobile either, even if a mobile-only image were somehow
  // set without one (not a supported admin state). When a dedicated mobile
  // image isn't uploaded, this falls back to the desktop image itself, which
  // needs different (unconstrained) rendering below — see
  // isMobileBannerFallback and .mobileBannerFallback in the CSS module.
  const mobileBannerUrl = showBanner ? banner?.imageUrlMobile || banner?.imageUrl || null : null;
  const isMobileBannerFallback = showBanner && !banner?.imageUrlMobile;

  return (
    <div className={styles.page}>
      <div className={styles.top}>
        {/* Desktop/tablet hero — unchanged behaviour, hidden below 768px via
            CSS (ProductListing.module.css). */}
        <div className={styles.desktopHero}>
          <Breadcrumbs items={breadcrumbs} />

          {showBanner && banner && <CategoryBanner banner={banner} title={h1} />}

          {/* Visual desktop heading — the page's one real <h1> is the mobile
              header's below (mobile-first indexing); each is hidden at the
              other breakpoint. */}
          {!showBanner && <p className={styles.heading}>{h1}</p>}
          {description && <p className={styles.description}>{description}</p>}
        </div>

        {/* Mobile-only hero — plain full-width banner (no text overlay),
            always-visible heading + breadcrumb, and a horizontally
            scrollable subcategory pill row. Hidden at 768px+ via CSS. */}
        <div className={styles.mobileHero}>
          {mobileBannerUrl && (
            <div
              className={
                isMobileBannerFallback ? `${styles.mobileBanner} ${styles.mobileBannerFallback}` : styles.mobileBanner
              }
            >
              <img src={mobileBannerUrl} alt={banner?.altText || ''} loading="lazy" decoding="async" />
            </div>
          )}

          <p className={styles.mobileBreadcrumb}>
            <Link to="/">Home</Link>
            <span aria-hidden="true"> › </span>
            <span>{heading}</span>
          </p>

          <h1 className={styles.mobileHeading}>{h1}</h1>
          {description && <p className={styles.mobileDescription}>{description}</p>}

          {subcategories && subcategories.length > 0 && (
            <nav className={styles.subcategoryNav} aria-label={`${heading} subcategories`}>
              <Link to={canonicalPath} className={`${styles.subcategoryPill} ${styles.subcategoryPillActive}`}>
                All
              </Link>
              {subcategories.map((sc) => (
                <Link key={sc.slug} to={sc.href} className={styles.subcategoryPill}>
                  {sc.name}
                </Link>
              ))}
            </nav>
          )}
        </div>

        <div className={styles.headerRow}>
          <div className={styles.headerLeft}>
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

          {isPastLastPage && (
            <div className={styles.stateBlock}>
              <p className={styles.emptyHeading}>This page doesn&rsquo;t exist</p>
              <p className={styles.message}>There are fewer pages of {heading} than that.</p>
              <Link to={canonicalPath} className={styles.retryButton}>
                View all {heading}
              </Link>
            </div>
          )}

          {data && products.length === 0 && !isPastLastPage && (
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

              {isPlainListing && (
                <ListingPageLinks
                  basePath={canonicalPath}
                  firstPage={page}
                  currentPage={lastLoadedPage}
                  totalPages={totalPages}
                />
              )}
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
