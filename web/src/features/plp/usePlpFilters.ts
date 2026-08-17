import { useSearchParams } from 'react-router-dom';
import type { SortOption } from '../../api/types';
import type { FilterValues } from './FilterSidebar';
import { parsePlpFilters } from './parsePlpFilters';

export function usePlpFilters() {
  const [searchParams, setSearchParams] = useSearchParams();

  const { metal, purity, goldColor, priceMin, priceMax, sort, page } = parsePlpFilters(searchParams);

  function updateFilters(patch: FilterValues) {
    const next = new URLSearchParams(searchParams);
    for (const [key, value] of Object.entries(patch)) {
      if (value === undefined || value === '') next.delete(key);
      else next.set(key, String(value));
    }
    next.delete('page');
    setSearchParams(next);
  }

  function updateSort(value: SortOption) {
    const next = new URLSearchParams(searchParams);
    next.set('sort', value);
    next.delete('page');
    setSearchParams(next);
  }

  function updatePage(value: number) {
    const next = new URLSearchParams(searchParams);
    next.set('page', String(value));
    setSearchParams(next);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function clearFilters() {
    setSearchParams(new URLSearchParams());
  }

  return {
    metal,
    purity,
    goldColor,
    priceMin,
    priceMax,
    sort,
    page,
    updateFilters,
    updateSort,
    updatePage,
    clearFilters,
  };
}
