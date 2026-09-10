import { Link } from 'react-router-dom';
import type { HomepageItem } from '../../api/types';
import { ProductCard } from '../../components/ProductCard';
import { placeholderGradient } from '../../utils/placeholderGradient';
import styles from './CollectionProductShowcase.module.css';

// Kept in sync with the media query in CollectionProductShowcase.module.css
// (same convention as HeroCarousel.tsx) — the <source> breakpoint here must
// match the CSS one, or the browser and the layout would switch banner
// images at different widths.
const MOBILE_BREAKPOINT = '(max-width: 767px)';

// One collection banner + up to 10 of that collection's products, sharing a
// single continuous container (plan: "banner and all ten products must feel
// like one continuous collection section"). A COLLECTION_SHOWCASE section
// is meant to carry exactly one item — if an admin adds more, only the
// first renders (see the matching admin hint in HomepagePage.tsx).
export function CollectionProductShowcase({ items }: { items: HomepageItem[] }) {
  const item = items[0];
  if (!item || !item.collection) return null;

  const { collection } = item;
  const href = `/collections/${collection.slug}`;
  const ctaLabel = item.ctaLabel?.trim() || 'Explore Collection';
  const products = item.products.slice(0, 10);

  return (
    <section className={styles.showcase} aria-labelledby="collection-showcase-heading">
      <div className={styles.banner}>
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
          <h2 id="collection-showcase-heading" className={styles.title}>
            {collection.name}
          </h2>
          {item.subheading && <p className={styles.description}>{item.subheading}</p>}
          <Link to={href} className={styles.cta}>
            {ctaLabel}
            <ArrowIcon />
          </Link>
        </div>
      </div>

      <div className={styles.productArea}>
        <div className={styles.viewAllRow}>
          <Link to={href} className={styles.viewAllLink}>
            View All →
          </Link>
        </div>

        {products.length > 0 ? (
          <div className={styles.productGrid}>
            {products.map((p, i) => (
              <ProductCard key={p.id} product={p} index={i} />
            ))}
          </div>
        ) : (
          <p className={styles.empty}>No products in this collection yet.</p>
        )}
      </div>
    </section>
  );
}

function ArrowIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}
