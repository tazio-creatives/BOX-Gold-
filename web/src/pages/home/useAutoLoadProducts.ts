import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ProductCard as ProductCardData } from '../../api/types';

const PAGE_SIZE = 6;
const MAX_AUTO = 50;

interface FetchPageResult {
  products: ProductCardData[];
  total: number;
}

interface UseAutoLoadProductsArgs {
  // Always re-fetches from the start with a growing `limit` (never advances
  // a page cursor) — the simplest way to guarantee the final auto-load
  // batch is exactly the remainder needed to reach 50 (e.g. requesting 50
  // after 48 already shown) without the offset arithmetic a fixed
  // page-size/incrementing-page scheme would need for that one partial
  // batch. A few bytes of redundant re-fetching per click is a fair trade
  // for that correctness.
  fetchPage: (limit: number) => Promise<FetchPageResult>;
  // Pass an already-known first batch (e.g. embedded in the SSR homepage
  // payload) to skip the initial network round-trip entirely — including
  // an empty array for a genuinely-empty collection/category (no refetch
  // needed, the caller already knows there's nothing). Omit it entirely to
  // have the hook fetch the first PAGE_SIZE itself on mount.
  initialProducts?: ProductCardData[];
}

// Shared "6 initially, auto-load 6 at a time up to 50, then a manual Load
// More" behaviour for the two homepage sections that need it (Shop by
// Category, Full-Width Home Collection) — kept as one hook rather than
// duplicated so the auto/manual phase switch, dedup, in-flight guard and
// retry logic can't drift between the two call sites.
export function useAutoLoadProducts({ fetchPage, initialProducts }: UseAutoLoadProductsArgs) {
  const hasInitial = initialProducts !== undefined;
  const [requestedCount, setRequestedCount] = useState(initialProducts?.length ?? 0);
  const [fetchedProducts, setFetchedProducts] = useState<ProductCardData[]>(initialProducts ?? []);
  const [total, setTotal] = useState<number | null>(null);
  const [isInitialLoading, setIsInitialLoading] = useState(!hasInitial);
  const [initialError, setInitialError] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState(false);
  const inFlightRef = useRef(false);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const loadInitial = useCallback(async () => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    setIsInitialLoading(true);
    setInitialError(false);
    try {
      const result = await fetchPage(PAGE_SIZE);
      setFetchedProducts(result.products);
      setTotal(result.total);
      setRequestedCount(PAGE_SIZE);
    } catch {
      setInitialError(true);
    } finally {
      setIsInitialLoading(false);
      inFlightRef.current = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!hasInitial) loadInitial();
    // Runs once per hook instance (this hook is remounted via `key` on
    // category/collection switch, same as before this hook existed) —
    // `hasInitial`/`loadInitial` are stable for that instance's lifetime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Never a ₹0/misconfigured-price or imageless card on the live homepage —
  // same rule both callers already applied before this hook existed.
  const products = useMemo(() => {
    const seen = new Set<string>();
    const list: ProductCardData[] = [];
    for (const p of fetchedProducts) {
      if (!seen.has(p.id) && p.sellingPrice > 0 && p.primaryImageUrl) {
        seen.add(p.id);
        list.push(p);
      }
    }
    return list;
  }, [fetchedProducts]);

  const hasMore = total === null ? true : requestedCount < total;
  const isAutoPhase = products.length < MAX_AUTO;

  const loadMore = useCallback(async () => {
    if (inFlightRef.current) return;
    if (total !== null && requestedCount >= total) return;
    inFlightRef.current = true;
    setIsLoadingMore(true);
    setLoadMoreError(false);
    try {
      const nextRequested = isAutoPhase ? Math.min(requestedCount + PAGE_SIZE, MAX_AUTO) : requestedCount + PAGE_SIZE;
      const result = await fetchPage(nextRequested);
      setFetchedProducts(result.products);
      setTotal(result.total);
      setRequestedCount(nextRequested);
    } catch {
      setLoadMoreError(true);
    } finally {
      setIsLoadingMore(false);
      inFlightRef.current = false;
    }
    // fetchPage intentionally excluded — callers pass a stable-enough
    // closure per category/collection instance, and including it would
    // re-create the callback (and risk a duplicate in-flight fetch) on
    // every parent re-render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAutoPhase, requestedCount, total]);

  // Auto-scroll only once the initial batch is in, and only while under the
  // 50-item cap with more known to exist — the sentinel simply isn't
  // rendered outside that window (see `showSentinel`), which both stops the
  // observer and satisfies "stop observing at 50 or when exhausted."
  const showSentinel = !isInitialLoading && !initialError && isAutoPhase && hasMore;

  useEffect(() => {
    if (!showSentinel) return;
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) loadMore();
      },
      { rootMargin: '600px 0px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [showSentinel, loadMore]);

  return {
    products,
    isInitialLoading,
    initialError,
    retryInitial: loadInitial,
    isAutoPhase,
    hasMore,
    isLoadingMore,
    loadMoreError,
    showSentinel,
    sentinelRef,
    loadMore,
  };
}
