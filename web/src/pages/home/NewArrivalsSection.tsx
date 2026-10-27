import { Link } from 'react-router-dom';
import type { HomepageItem } from '../../api/types';
import { ProductRail } from './ProductRail';
import styles from './NewArrivalsSection.module.css';

// Decorative line-art watermark for the feature banner — no real jewellery
// photograph asset exists in this repo (only favicon/logo/auth-hero.jpg are
// available), so the banner uses a designed warm-gradient ground plus this
// SVG motif instead of a photo. Swap in a real photograph via `.bannerArt`'s
// background-image whenever one is supplied.
function BannerArt() {
  return (
    <svg className={styles.bannerArtSvg} viewBox="0 0 260 260" fill="none" aria-hidden="true">
      <circle cx="190" cy="90" r="70" stroke="currentColor" strokeWidth="1" opacity="0.5" />
      <circle cx="190" cy="90" r="46" stroke="currentColor" strokeWidth="1" opacity="0.7" />
      <path d="M60 220 Q160 160 230 210" stroke="currentColor" strokeWidth="1" opacity="0.5" fill="none" />
      <path d="M40 190 Q150 120 245 175" stroke="currentColor" strokeWidth="1" opacity="0.35" fill="none" />
    </svg>
  );
}

// Redesigned New Arrivals: a 31%/69% feature-banner + product-carousel row
// (reference mockup). The backend returns one auto item whose `.products`
// array is in the full ProductCard DTO shape (see homepage.repository.js) —
// same shape the PLP uses — so the standard ProductCard is reused (via
// ProductRail) instead of hand-rolled card markup or price math.
const MOBILE_BREAKPOINT = '(max-width: 767px)';

// The products follow the banner item's linked collection or category when
// one is set (homepage.repository.js), so "View All" goes to that listing.
// The banner carries the section's only title/subtitle — no second heading
// over the products.
export function NewArrivalsSection({ items }: { items: HomepageItem[] }) {
  const item = items[0];
  const products = (item?.products ?? []).slice(0, 10);
  const viewAllUrl = item?.collection
    ? `/collections/${item.collection.slug}`
    : item?.category
      ? `/${item.category.slug}`
      : '/new-arrivals?sort=newest';
  const bannerImage = item?.imageUrl ?? null;
  const bannerImageMobile = item?.imageUrlMobile ?? null;
  const bannerTitle = item?.heading || 'New Arrivals';
  const bannerSubtitle = item?.subheading || 'From festive sparkle to everyday essentials';

  if (products.length === 0) return null;

  return (
    <section className={styles.section} aria-label="New Arrivals">
      <div className={styles.banner}>
        {bannerImage ? (
          <picture>
            {bannerImageMobile && <source media={MOBILE_BREAKPOINT} srcSet={bannerImageMobile} />}
            <img
              src={bannerImage}
              alt="New arrivals in diamond jewellery — BOX DIAMONDS"
              className={styles.bannerImg}
              loading="lazy"
              decoding="async"
            />
          </picture>
        ) : (
          <BannerArt />
        )}
        <div className={styles.bannerScrim} aria-hidden="true" />
        <div className={styles.bannerCopy}>
          <p className={styles.bannerTitle}>{bannerTitle}</p>
          <p className={styles.bannerSubtitle}>{bannerSubtitle}</p>
        </div>
      </div>

      <div className={styles.productArea}>
        <div className={styles.productHeader}>
          <Link to={viewAllUrl} className={styles.viewAllLink}>
            View All →
          </Link>
        </div>

        <ProductRail products={products} slideClassName={styles.slide} />
      </div>
    </section>
  );
}
