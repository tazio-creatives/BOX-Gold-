import { useEffect, useState, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { search } from '../../api/search';
import { productUrl } from '../../utils/productUrl';
import { formatPrice } from '../../utils/formatPrice';
import { useDebouncedValue } from './useDebouncedValue';
import { trackSearch } from './trackSearch';
import { searchResultsUrl } from './searchResultsUrl';
import styles from './SearchBar.module.css';

export function SearchBar() {
  const [term, setTerm] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const debouncedTerm = useDebouncedValue(term.trim(), 300);
  // Results update live while typing; the Search event waits for the term to
  // settle so "r", "ri", "rin" aren't each counted as searches.
  const settledTerm = useDebouncedValue(term.trim(), 1200);
  useEffect(() => {
    if (settledTerm.length >= 3) trackSearch(settledTerm);
  }, [settledTerm]);
  const containerRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  // Enter opens the full results page for whatever is typed.
  function openResults() {
    const q = term.trim();
    if (!q) return;
    setIsOpen(false);
    navigate(searchResultsUrl(q));
  }

  const { data, isFetching } = useQuery({
    queryKey: ['search', debouncedTerm],
    queryFn: () => search(debouncedTerm),
    enabled: debouncedTerm.length > 0,
    staleTime: 30_000,
  });

  const showDropdown =
    isOpen &&
    debouncedTerm.length > 0 &&
    !!data &&
    (data.products.length > 0 || data.categories.length > 0 || data.collections.length > 0);

  return (
    <div className={styles.container} ref={containerRef}>
      <form
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          openResults();
        }}
      >
      <input
        type="search"
        className={styles.input}
        placeholder="Search rings, earrings, necklaces..."
        value={term}
        onChange={(e) => setTerm(e.target.value)}
        onFocus={() => setIsOpen(true)}
        onBlur={() => setTimeout(() => setIsOpen(false), 150)}
        aria-label="Search products"
        enterKeyHint="search"
      />
      </form>
      <svg
        className={styles.searchIcon}
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        aria-hidden="true"
      >
        <circle cx="11" cy="11" r="7" />
        <path d="M21 21l-4.3-4.3" />
      </svg>
      {isOpen && debouncedTerm.length > 0 && (
        <div className={styles.dropdown} role="listbox">
          {isFetching && <p className={styles.empty}>Searching…</p>}
          {!isFetching && !showDropdown && (
            <p className={styles.empty}>No results for "{debouncedTerm}"</p>
          )}

          {data && data.categories.length > 0 && (
            <div className={styles.group}>
              <p className={styles.groupLabel}>Categories</p>
              {data.categories.map((c) => (
                <Link key={c.id} to={`/${c.slug}`} className={styles.resultRow}>
                  {c.name}
                </Link>
              ))}
            </div>
          )}

          {data && data.collections.length > 0 && (
            <div className={styles.group}>
              <p className={styles.groupLabel}>Collections</p>
              {data.collections.map((c) => (
                <Link key={c.id} to={`/collections/${c.slug}`} className={styles.resultRow}>
                  {c.name}
                </Link>
              ))}
            </div>
          )}

          {data && data.products.length > 0 && (
            <div className={styles.group}>
              <p className={styles.groupLabel}>Products</p>
              {data.products.map((p) => (
                <Link key={p.id} to={productUrl(p)} className={styles.resultRow}>
                  <span>{p.name}</span>
                  <span className={styles.price}>{formatPrice(p.sellingPrice)}</span>
                </Link>
              ))}
              {data.total > data.products.length && (
                <Link to={searchResultsUrl(debouncedTerm)} className={styles.viewAll} rel="nofollow">
                  View all {data.total} results
                </Link>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
