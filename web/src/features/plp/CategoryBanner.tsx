import type { CategoryBanner as CategoryBannerData } from '../../api/types';
import styles from './CategoryBanner.module.css';

const MOBILE_BREAKPOINT = '(max-width: 767px)';

const TEXT_POSITION_CLASS: Record<CategoryBannerData['textPosition'], string> = {
  LEFT: styles.posLeft,
  CENTER: styles.posCenter,
  RIGHT: styles.posRight,
};

const FOCAL_POSITION_VALUE: Record<CategoryBannerData['focalPosition'], string> = {
  LEFT: 'left center',
  CENTER: 'center',
  RIGHT: 'right center',
};

interface CategoryBannerProps {
  banner: CategoryBannerData;
  title: string;
}

// Renders the category's own name as the page's one real H1 — callers must
// not render a second <h1> below this when a banner is shown (see
// ProductListing.tsx, which drops its own heading whenever `banner` is
// passed). No CTA — the customer is already on this category's page.
export function CategoryBanner({ banner, title }: CategoryBannerProps) {
  if (!banner.imageUrl) return null;

  const textClass = banner.textColor === 'DARK' ? styles.textDark : styles.textLight;
  const focalPosition = FOCAL_POSITION_VALUE[banner.focalPosition];

  return (
    <div className={`${styles.banner} ${textClass}`} style={{ ['--banner-focal-position' as string]: focalPosition }}>
      <picture>
        {banner.imageUrlMobile && <source media={MOBILE_BREAKPOINT} srcSet={banner.imageUrlMobile} />}
        <img
          src={banner.imageUrl}
          alt={banner.altText ?? ''}
          className={styles.img}
          style={{ objectPosition: focalPosition }}
          width={1920}
          height={600}
          loading="eager"
          fetchPriority="high"
          decoding="async"
        />
      </picture>
      {banner.textColor === 'LIGHT' && <div className={styles.scrim} aria-hidden="true" />}

      <div className={`${styles.copy} ${TEXT_POSITION_CLASS[banner.textPosition]}`}>
        {banner.eyebrow && <p className={styles.eyebrow}>{banner.eyebrow}</p>}
        <h1 className={styles.title}>{title}</h1>
        {banner.description && <p className={styles.description}>{banner.description}</p>}
      </div>
    </div>
  );
}
