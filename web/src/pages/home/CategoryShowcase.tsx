import { useEffect, useRef, useState } from 'react';
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

function ChevronIcon({ direction }: { direction: 'left' | 'right' }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points={direction === 'left' ? '15 18 9 12 15 6' : '9 18 15 12 9 6'} />
    </svg>
  );
}

function CategoryCard({ item }: { item: HomepageItem }) {
  const href = linkFor(item);
  const imageUrl = imageFor(item);
  const name = nameFor(item);

  const content = (
    <>
      <div className={styles.imageWrapper}>
        {/* subheading doubles as an optional promo tag ("Special") on a tile — no
            dedicated badge field exists on HomepageItem, and this one is already
            unused elsewhere in this section. */}
        {item.subheading && <span className={styles.badge}>{item.subheading}</span>}
        {imageUrl && <img src={imageUrl} alt="" loading="lazy" decoding="async" />}
      </div>
      {name && <p className={styles.cardName}>{name}</p>}
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

interface CategoryShowcaseProps {
  items: HomepageItem[];
  heading?: string | null;
}

// Horizontal scrollable strip of circular-ish category tiles with left/right
// nav arrows — replaces the earlier fixed-6-item asymmetric bento grid.
// Renders for any item count (no longer position-locked to 6).
export function CategoryShowcase({ items, heading }: CategoryShowcaseProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  function updateScrollState() {
    const el = trackRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 4);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  }

  useEffect(() => {
    updateScrollState();
    window.addEventListener('resize', updateScrollState);
    return () => window.removeEventListener('resize', updateScrollState);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items.length]);

  function scrollByPage(direction: 1 | -1) {
    trackRef.current?.scrollBy({ left: direction * trackRef.current.clientWidth * 0.7, behavior: 'smooth' });
  }

  if (items.length === 0) return null;

  return (
    <div className={styles.categorySection}>
      {heading && <h2 className={styles.heading}>{heading}</h2>}
      <div className={styles.scrollerWrapper}>
        {canScrollLeft && (
          <button
            type="button"
            className={`${styles.navButton} ${styles.navLeft}`}
            onClick={() => scrollByPage(-1)}
            aria-label="Scroll categories left"
          >
            <ChevronIcon direction="left" />
          </button>
        )}
        <div className={styles.categoryTrack} ref={trackRef} onScroll={updateScrollState}>
          {items.map((item) => (
            <CategoryCard key={item.id} item={item} />
          ))}
        </div>
        {canScrollRight && (
          <button
            type="button"
            className={`${styles.navButton} ${styles.navRight}`}
            onClick={() => scrollByPage(1)}
            aria-label="Scroll categories right"
          >
            <ChevronIcon direction="right" />
          </button>
        )}
      </div>
    </div>
  );
}
