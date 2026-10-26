import { useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { search } from '../api/search';
import { PlpProductCard } from '../components/PlpProductCard';
import { Breadcrumbs } from '../components/Breadcrumbs';
import { Pagination } from '../components/Pagination';
import { QuickAddSheet } from '../features/plp/QuickAddSheet';
import { useQuickAdd } from '../features/plp/useQuickAdd';
import { trackSearch } from '../features/search/trackSearch';
import { searchResultsUrl } from '../features/search/searchResultsUrl';
import { useHead } from '../seo/head';
import listingStyles from '../features/plp/ProductListing.module.css';
import styles from './SearchResultsPage.module.css';

const PAGE_SIZE = 24;

// /search?q=…&page=… — the full results behind the header search dropdown.
// Client-rendered only (the SSR server treats /search as CSR-only, so
// result pages are never server-rendered or stored in the page cache), and
// marked noindex: internal search results aren't pages for Google.
export function SearchResultsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const q = (searchParams.get('q') ?? '').trim().slice(0, 100);
  const page = Math.min(100, Math.max(1, Number(searchParams.get('page')) || 1));
  const quickAdd = useQuickAdd();

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['search-results', q.toLowerCase().replace(/\s+/g, ' '), page],
    queryFn: () => search(q, { page, limit: PAGE_SIZE }),
    enabled: q.length > 0,
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });

  useEffect(() => {
    if (q) trackSearch(q);
  }, [q]);

  useHead({
    title: q ? `Search results for “${q}” | BOX DIAMONDS` : 'Search | BOX DIAMONDS',
    description: 'Search BOX DIAMONDS certified natural diamond jewellery by name, product code, category or type.',
    canonicalPath: '/search',
    jsonLd: [],
    robots: 'noindex, follow',
  });

  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);
  const products = data?.products ?? [];

  return (
    <div className={listingStyles.page}>
      <div className={styles.header}>
        <Breadcrumbs items={[{ label: 'Search' }]} />
        <h1 className={listingStyles.heading}>{q ? <>Search results for “{q}”</> : 'Search'}</h1>
        {q && data && (
          <p className={styles.count} aria-live="polite">
            {total === 1 ? '1 product' : `${total} products`}
            {totalPages > 1 && ` · page ${page} of ${totalPages}`}
          </p>
        )}
      </div>

      {!q && (
        <div className={listingStyles.stateBlock}>
          <p className={listingStyles.emptyHeading}>What are you looking for?</p>
          <p className={listingStyles.message}>Search by product name, product code, category or type — for example “gents ring”.</p>
        </div>
      )}

      {q && isLoading && (
        <div className={listingStyles.grid} aria-busy="true">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className={listingStyles.skeletonCard}>
              <div className={listingStyles.skeletonImage} />
              <div className={listingStyles.skeletonLine} style={{ width: '90%' }} />
              <div className={listingStyles.skeletonLine} style={{ width: '60%' }} />
              <div className={listingStyles.skeletonButton} />
            </div>
          ))}
        </div>
      )}

      {isError && (
        <div className={listingStyles.stateBlock}>
          <p className={listingStyles.message}>Couldn't load search results right now.</p>
          <button type="button" className={listingStyles.retryButton} onClick={() => refetch()}>
            Retry
          </button>
        </div>
      )}

      {q && data && products.length === 0 && (
        <div className={listingStyles.stateBlock}>
          <p className={listingStyles.emptyHeading}>No products found for “{q}”</p>
          <p className={listingStyles.message}>Check the spelling, try fewer words, or search by product code.</p>
          <Link to="/jewellery" className={listingStyles.retryButton}>
            Browse all jewellery
          </Link>
        </div>
      )}

      {products.length > 0 && (
        <>
          <div className={listingStyles.grid}>
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
          <div className={styles.pagination}>
            <Pagination
              page={page}
              totalPages={totalPages}
              onChange={(next) => {
                const url = new URL(searchResultsUrl(q, next), 'http://x');
                setSearchParams(url.searchParams);
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
            />
          </div>
        </>
      )}

      {quickAdd.sheetProduct && <QuickAddSheet product={quickAdd.sheetProduct} onClose={quickAdd.closeSheet} />}
    </div>
  );
}
