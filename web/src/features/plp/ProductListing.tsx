import { useState } from 'react';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { fetchProducts } from '../../api/products';
import { fetchCategoryFilterCounts } from '../../api/categories';
import { ProductCard } from '../../components/ProductCard';
import { Pagination } from '../../components/Pagination';
import { Breadcrumbs, type Crumb } from '../../components/Breadcrumbs';
import { FilterSidebar, type CategoryFilterGroup } from './FilterSidebar';
import { SortSelect } from './SortSelect';
import { ViewToggle, type ViewMode } from './ViewToggle';
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
  const { metal, purity, goldColor, priceMin, priceMax, sort, page, updateFilters, updateSort, updatePage, clearFilters } =
    usePlpFilters();
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [isFilterDrawerOpen, setIsFilterDrawerOpen] = useState(false);

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

  const { data, isLoading, isError } = useQuery({
    queryKey: ['products', { categorySlug, collectionSlug, metal, purity, goldColor, priceMin, priceMax, sort, page }],
    queryFn: () =>
      fetchProducts({
        category: categorySlug,
        collection: collectionSlug,
        metal,
        purity,
        goldColor,
        priceMin,
        priceMax,
        sort,
        page,
        limit: 24,
      }),
    placeholderData: keepPreviousData,
  });

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
        <h1 className={styles.heading}>{heading}</h1>
        {description && <p className={styles.description}>{description}</p>}
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
          <div className={styles.toolbar}>
            <div className={styles.toolbarLeft}>
              <button
                type="button"
                className={styles.filtersButton}
                onClick={() => setIsFilterDrawerOpen(true)}
              >
                Filters
                {activeFilterCount > 0 && <span className={styles.filtersButtonCount}>{activeFilterCount}</span>}
              </button>
              <p className={styles.count} aria-live="polite">
                {data ? `${data.total} ${data.total === 1 ? 'Product' : 'Products'}` : ' '}
              </p>
            </div>
            <div className={styles.toolbarActions}>
              <SortSelect value={sort} onChange={updateSort} />
              <ViewToggle value={viewMode} onChange={setViewMode} />
            </div>
          </div>

          {isLoading && (
            <div className={styles.grid} aria-busy="true">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className={styles.skeletonCard} />
              ))}
            </div>
          )}

          {isError && <p className={styles.message}>Couldn't load products right now.</p>}

          {data && data.products.length === 0 && (
            <p className={styles.message}>No pieces match these filters.</p>
          )}

          {data && data.products.length > 0 && (
            <div className={viewMode === 'grid' ? styles.grid : styles.list}>
              {data.products.map((product, i) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  index={i}
                  layout={viewMode}
                  imageFit="contain"
                  imageHeight="260px"
                />
              ))}
            </div>
          )}

          {data && <Pagination page={data.page} totalPages={data.totalPages} onChange={updatePage} />}
        </div>
      </div>
    </div>
  );
}
