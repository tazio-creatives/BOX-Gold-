import { Link } from 'react-router-dom';
import { fetchProducts } from '../../api/products';
import { ProductCard } from '../../components/ProductCard';
import { useAutoLoadProducts } from './useAutoLoadProducts';
import styles from './CategoryProductGrid.module.css';

// "View All {category}" reads oddly for a singular category name (e.g.
// "View All Bangle") — a simple trailing-s pluralization covers every
// category name in use today (Bangle -> Bangles, Ring -> Rings, Pendant ->
// Pendants) and is a safe no-op for names already plural (Earrings, Gents).
function pluralize(name: string): string {
  return name.endsWith('s') ? name : `${name}s`;
}

interface CategoryProductGridProps {
  panelId: string;
  categorySlug: string;
  categoryName: string;
}

// Products for the currently-selected homepage category tile — fetched
// through the exact same `/products` endpoint, DTO and pricing the PLP/
// search/PDP already use (see api/products.ts's fetchProducts), so prices,
// discounts and eligibility filtering are guaranteed identical to visiting
// the category page directly. Rendered with the shared ProductCard
// component unmodified (same one NewArrivalsSection already reuses here).
// Product loading itself (6 initially, auto-loads to 50, then a manual
// Load More) is useAutoLoadProducts — shared with
// CollectionProductShowcase.tsx so the two don't drift.
//
// Remounted (via the `key` the caller passes) on every category switch —
// that alone resets all of the hook's state and clears the previous
// category's cards from view.
export function CategoryProductGrid({ panelId, categorySlug, categoryName }: CategoryProductGridProps) {
  const {
    products,
    isInitialLoading,
    initialError,
    retryInitial,
    isAutoPhase,
    hasMore,
    isLoadingMore,
    loadMoreError,
    showSentinel,
    sentinelRef,
    loadMore,
  } = useAutoLoadProducts({
    fetchPage: async (limit) => {
      const result = await fetchProducts({ category: categorySlug, page: 1, limit });
      return { products: result.products, total: result.total };
    },
  });

  const categoryUrl = `/${categorySlug}`;
  const showLoadMoreButton = !isAutoPhase && hasMore;

  return (
    <div id={panelId} className={styles.panel} role="region" aria-live="polite" aria-label={`${categoryName} products`}>
      <div className={styles.panelHeader}>
        <h3 className={styles.panelTitle}>{categoryName} Collection</h3>
        <Link to={categoryUrl} className={styles.panelViewAll}>
          View All {pluralize(categoryName)} →
        </Link>
      </div>
      {isInitialLoading ? (
        <div className={styles.grid}>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className={styles.skeletonCard}>
              <div className={styles.skeletonImage} />
              <div className={styles.skeletonLine} style={{ width: '60%' }} />
              <div className={styles.skeletonLine} style={{ width: '85%' }} />
              <div className={styles.skeletonLine} style={{ width: '40%' }} />
            </div>
          ))}
        </div>
      ) : initialError ? (
        <div className={styles.stateBlock}>
          <p className={styles.message}>Couldn&apos;t load products for this category.</p>
          <button type="button" className={styles.retryButton} onClick={() => retryInitial()}>
            Try again
          </button>
        </div>
      ) : products.length === 0 ? (
        <div className={styles.stateBlock}>
          <p className={styles.message}>No products available in this category.</p>
          <Link to={categoryUrl} className={styles.emptyLink}>
            View Category →
          </Link>
        </div>
      ) : (
        <>
          <div className={styles.grid}>
            {products.map((product, i) => (
              <div key={product.id} className={styles.item}>
                <ProductCard product={product} index={i} flat />
              </div>
            ))}
          </div>

          {/* Auto-scroll zone — sentinel triggers the next batch on its own
              via IntersectionObserver while under 50 products; no button
              here at all during this phase. */}
          {showSentinel && (
            <div ref={sentinelRef} className={styles.autoLoadRow} aria-live="polite">
              {isLoadingMore && (
                <>
                  <span className={styles.spinner} aria-hidden="true" />
                  <span>Loading products…</span>
                </>
              )}
              {loadMoreError && (
                <button type="button" className={styles.compactRetryButton} onClick={() => loadMore()}>
                  Retry
                </button>
              )}
            </div>
          )}

          {/* 50+ reached with more still available — automatic loading
              stops and a manual, compact Load More button takes over. */}
          {showLoadMoreButton && (
            <div className={styles.loadMoreRow}>
              <button
                type="button"
                className={styles.loadMoreButton}
                onClick={() => loadMore()}
                disabled={isLoadingMore}
                aria-busy={isLoadingMore}
              >
                {isLoadingMore && <span className={styles.spinner} aria-hidden="true" />}
                {isLoadingMore ? 'Loading…' : 'Load More'}
              </button>
            </div>
          )}
          {loadMoreError && !isAutoPhase && (
            <p className={styles.loadMoreErrorText}>Couldn&apos;t load more products. Please try again.</p>
          )}
          {!hasMore && <p className={styles.viewedAll}>You&apos;ve viewed all products in this category.</p>}
        </>
      )}
    </div>
  );
}
