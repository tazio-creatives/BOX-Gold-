import type { HomepageItem } from '../../api/types';
import { ProductRail } from './ProductRail';
import styles from './FeaturedProductsSection.module.css';

// FEATURED_PRODUCT: the products an admin starred "Featured" on the Products
// page. The backend sends one auto item whose `.products` are full listing
// rows (homepage.repository.js), shown with the standard ProductCard — same
// cards, auto-scroll and dots as New Arrivals — under a centred title like
// the homepage's other titled sections (e.g. ImageMosaic).
export function FeaturedProductsSection({ items, heading }: { items: HomepageItem[]; heading: string }) {
  const products = items[0]?.products ?? [];
  if (products.length === 0) return null;

  return (
    <section className={styles.section} aria-label={heading}>
      <h2 className={styles.heading}>{heading}</h2>
      <ProductRail products={products} slideClassName={styles.slide} className={styles.rail} />
    </section>
  );
}
