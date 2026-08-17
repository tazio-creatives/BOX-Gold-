import { Link } from 'react-router-dom';
import type { HomepageItem } from '../../api/types';
import { formatPrice } from '../../utils/formatPrice';
import { placeholderGradient } from '../../utils/placeholderGradient';
import styles from './CategoryProductRow.module.css';

function materialFor(product: { metalType: string | null; purity: string | null }): string | null {
  if (!product.metalType) return null;
  const metalLabel = product.metalType === 'GOLD' ? 'Gold' : 'Platinum';
  return product.purity ? `${product.purity} ${metalLabel}` : metalLabel;
}

// One category's block: an image+name tile leading the same row as its top
// 5 products (no carousel — the count is fixed, unlike ProductCarousel),
// then a View All button. A section can list several of these stacked.
function CategoryBlock({ item, index }: { item: HomepageItem; index: number }) {
  const category = item.category;
  if (!category || item.products.length === 0) return null;

  return (
    <div className={styles.categoryBlock}>
      <div className={styles.productRow}>
        <Link to={`/${category.slug}`} className={styles.categoryTile}>
          {category.imageUrl ? (
            <img src={category.imageUrl} alt={category.name} loading="lazy" decoding="async" />
          ) : (
            <div className={styles.categoryTilePlaceholder} style={{ background: placeholderGradient(index) }} />
          )}
          <div className={styles.categoryTileOverlay}>
            <p className={styles.categoryTileName}>{category.name}</p>
          </div>
        </Link>

        {item.products.slice(0, 5).map((product, i) => {
          const material = materialFor(product);
          return (
            <Link
              key={product.id}
              to={product.categorySlug ? `/${product.categorySlug}/${product.slug}` : `/${product.slug}`}
              className={styles.productCard}
            >
              <div className={styles.productImageWrapper}>
                {product.primaryImageUrl ? (
                  <img src={product.primaryImageUrl} alt={product.name} loading="lazy" decoding="async" />
                ) : (
                  <div className={styles.productImagePlaceholder} style={{ background: placeholderGradient(i) }} />
                )}
              </div>
              <div className={styles.productInfo}>
                <h4 className={styles.productName}>{product.name}</h4>
                {material && <p className={styles.productMaterial}>{material}</p>}
                <p className={styles.productPrice}>{formatPrice(product.sellingPrice)}</p>
              </div>
            </Link>
          );
        })}
      </div>

      <Link to={`/${category.slug}`} className={styles.viewAllButton}>
        View All {category.name}
      </Link>
    </div>
  );
}

export function CategoryProductRow({ items, heading }: { items: HomepageItem[]; heading?: string | null }) {
  const blocks = items.filter((item) => item.category && item.products.length > 0);
  if (blocks.length === 0) return null;

  return (
    <section className={styles.categorySection}>
      {heading && <h2 className={styles.sectionHeading}>{heading}</h2>}
      {blocks.map((item, i) => (
        <CategoryBlock key={item.id} item={item} index={i} />
      ))}
    </section>
  );
}
