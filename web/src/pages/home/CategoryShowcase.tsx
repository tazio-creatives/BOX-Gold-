import { Link } from 'react-router-dom';
import type { HomepageItem } from '../../api/types';
import styles from './CategoryShowcase.module.css';

function linkFor(item: HomepageItem): string | null {
  if (item.ctaUrl) return item.ctaUrl;
  if (item.category) return `/${item.category.slug}`;
  if (item.collection) return `/collections/${item.collection.slug}`;
  return null;
}

function imageFor(item: HomepageItem): string | null {
  return item.imageUrl ?? item.category?.imageUrl ?? null;
}

function nameFor(item: HomepageItem): string | null {
  return item.category?.name ?? item.heading;
}

function CategoryCard({ item }: { item: HomepageItem }) {
  const href = linkFor(item);
  const imageUrl = imageFor(item);
  const name = nameFor(item);

  const content = (
    <>
      {imageUrl && <img src={imageUrl} alt="" loading="lazy" decoding="async" />}
      <div className={styles.categoryContent}>
        {name && <h3>{name}</h3>}
        <span>Explore →</span>
      </div>
    </>
  );

  return href ? (
    <Link to={href} className={styles.categoryCard}>
      {content}
    </Link>
  ) : (
    <div className={styles.categoryCard}>{content}</div>
  );
}

// Fixed 3-tall / 1-stacked-pair / 1-tall composition — only renders when
// there are exactly 6 categories (matches the reference layout, which is
// itself a 5-column asymmetric grid). Position-based only: no category is
// ever identified by name, only by its index in the array the API returned.
export function CategoryShowcase({ items }: { items: HomepageItem[] }) {
  const [first, second, third, fourth, fifth, sixth] = items;
  if (!first || !second || !third || !fourth || !fifth || !sixth) return null;

  return (
    <div className={styles.categorySection}>
      <div className={styles.categoryGrid}>
        <CategoryCard item={first} />
        <CategoryCard item={second} />
        <CategoryCard item={third} />
        <div className={styles.categoryStack}>
          <CategoryCard item={fourth} />
          <CategoryCard item={fifth} />
        </div>
        <CategoryCard item={sixth} />
      </div>
    </div>
  );
}
