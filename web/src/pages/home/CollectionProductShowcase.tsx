import { Link } from 'react-router-dom';
import type { HomepageItem } from '../../api/types';
import { fetchProducts } from '../../api/products';
import { ProductCard } from '../../components/ProductCard';
import { placeholderGradient } from '../../utils/placeholderGradient';
import { useAutoLoadProducts } from './useAutoLoadProducts';
import styles from './CollectionProductShowcase.module.css';

// Kept in sync with the media query in CollectionProductShowcase.module.css
// (same convention as HeroCarousel.tsx) — the <source> breakpoint here must
// match the CSS one, or the browser and the layout would switch banner
// images at different widths.
const MOBILE_BREAKPOINT = '(max-width: 767px)';

// One collection banner + up to 50 of that collection's products, sharing a
// single continuous container (plan: "banner and all products must feel
// like one continuous collection section"). A COLLECTION_SHOWCASE section
// is meant to carry exactly one item — if an admin adds more, only the
// first renders (see the matching admin hint in HomepagePage.tsx). Product
// loading itself (6 initially, auto-loads to 50, then a manual Load More)
// is useAutoLoadProducts — shared with CategoryProductGrid.tsx so the two
// don't drift.
export function CollectionProductShowcase({ items }: { items: HomepageItem[] }) {
  const item = items[0];

  const { products, isAutoPhase, hasMore, isLoadingMore, loadMoreError, showSentinel, sentinelRef, loadMore } =
    useAutoLoadProducts({
      initialProducts: item?.products ?? [],
      fetchPage: async (limit) => {
        const result = await fetchProducts({ collection: item?.collection?.slug, page: 1, limit });
        return { products: result.products, total: result.total };
      },
    });

  if (!item || !item.collection) return null;

  const { collection } = item;
  const href = `/collections/${collection.slug}`;
  const showLoadMoreButton = !isAutoPhase && hasMore;

  return (
    <section className={styles.showcase} aria-label={collection.name}>
      <Link to={href} className={styles.banner} aria-label={`Explore ${collection.name}`}>
        {item.imageUrl ? (
          <picture>
            {item.imageUrlMobile && <source media={MOBILE_BREAKPOINT} srcSet={item.imageUrlMobile} />}
            <img
              src={item.imageUrl}
              alt=""
              className={styles.bannerImg}
              loading="lazy"
              decoding="async"
            />
          </picture>
        ) : (
          <div className={styles.bannerImg} style={{ background: placeholderGradient(0) }} aria-hidden="true" />
        )}
        <div className={styles.scrim} aria-hidden="true" />

        <div className={styles.bannerCopy}>
          {item.heading && <p className={styles.eyebrow}>{item.heading}</p>}
          {item.subheading && <p className={styles.description}>{item.subheading}</p>}
        </div>
      </Link>

      <div className={styles.productArea}>
        {products.length > 0 ? (
          <>
            <div className={styles.productGrid}>
              {products.map((p, i) => (
                <ProductCard key={p.id} product={p} index={i} imagePadding={false} flat />
              ))}
            </div>

            {/* Auto-scroll zone — sentinel triggers the next batch on its
                own via IntersectionObserver while under 50 products; no
                button here at all during this phase. */}
            {showSentinel && (
              <div ref={sentinelRef} className={styles.autoLoadRow} aria-live="polite">
                {isLoadingMore && (
                  <>
                    <span className={styles.spinner} aria-hidden="true" />
                    <span>Loading products…</span>
                  </>
                )}
                {loadMoreError && (
                  <button type="button" className={styles.retryButton} onClick={() => loadMore()}>
                    Retry
                  </button>
                )}
              </div>
            )}

            {/* 50+ reached with more still available — automatic loading
                stops and a manual, compact Load More button takes over. */}
            {showLoadMoreButton && (
              <div className={styles.actionRow}>
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
            {!hasMore && <p className={styles.viewedAll}>You&apos;ve viewed all products in this collection.</p>}
          </>
        ) : (
          <p className={styles.empty}>No products in this collection yet.</p>
        )}
      </div>
    </section>
  );
}
