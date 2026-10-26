import { Link } from 'react-router-dom';
import { getPageNumbers } from '../../components/pageNumbers';
import styles from '../../components/Pagination.module.css';

function listingPageHref(basePath: string, page: number): string {
  return page > 1 ? `${basePath}?page=${page}` : basePath;
}

// Plain <a href> page links under a listing grid — present in the server HTML
// so crawlers can reach every page of a category/collection without running
// JavaScript or scrolling. Shoppers still get infinite scroll; these are the
// fallback. Same look as the shared Pagination component.
export function ListingPageLinks({
  basePath,
  firstPage,
  currentPage,
  totalPages,
}: {
  basePath: string;
  // First page in this view (the ?page=N it was opened on).
  firstPage: number;
  // Last page currently on screen (grows as infinite scroll loads more).
  currentPage: number;
  totalPages: number;
}) {
  if (totalPages <= 1) return null;
  const toTop = () => window.scrollTo(0, 0);

  return (
    <nav className={styles.nav} aria-label="Pages">
      {firstPage > 1 && (
        <Link to={listingPageHref(basePath, firstPage - 1)} className={styles.arrowButton} rel="prev" aria-label="Previous page" onClick={toTop}>
          ‹
        </Link>
      )}
      {getPageNumbers(currentPage, totalPages).map((p, i) =>
        p === 'ellipsis' ? (
          <span key={`ellipsis-${i}`} className={styles.ellipsis}>
            …
          </span>
        ) : (
          <Link
            key={p}
            to={listingPageHref(basePath, p)}
            className={`${styles.pageButton} ${p >= firstPage && p <= currentPage ? styles.pageButtonActive : ''}`}
            aria-current={p === currentPage ? 'page' : undefined}
            onClick={toTop}
          >
            {p}
          </Link>
        ),
      )}
      {currentPage < totalPages && (
        <Link to={listingPageHref(basePath, currentPage + 1)} className={styles.arrowButton} rel="next" aria-label="Next page" onClick={toTop}>
          ›
        </Link>
      )}
    </nav>
  );
}
