import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { HomepageItem } from '../../api/types';
import { placeholderGradient } from '../../utils/placeholderGradient';
import styles from './HeroCarousel.module.css';

function linkFor(item: HomepageItem): string | null {
  if (item.ctaUrl) return item.ctaUrl;
  if (item.category) return `/${item.category.slug}`;
  if (item.collection) return `/collections/${item.collection.slug}`;
  return null;
}

const ROTATE_MS = 6000;
// Kept in sync with the media query in HeroCarousel.module.css — the
// <source> breakpoint below must match the CSS one, otherwise the browser
// and the layout would switch images at different widths.
const MOBILE_BREAKPOINT = '(max-width: 767px)';

export function HeroCarousel({ items, eyebrow }: { items: HomepageItem[]; eyebrow?: string | null }) {
  const [active, setActive] = useState(0);

  useEffect(() => {
    if (items.length < 2) return;
    const id = window.setInterval(() => {
      setActive((prev) => (prev + 1) % items.length);
    }, ROTATE_MS);
    return () => window.clearInterval(id);
  }, [items.length]);

  const item = items[active];
  if (!item) return null;
  const href = linkFor(item);
  const gradient = placeholderGradient(active);

  return (
    <div className={styles.hero}>
      <div className={styles.bg}>
        {item.imageUrl ? (
          <picture>
            {item.imageUrlMobile && <source media={MOBILE_BREAKPOINT} srcSet={item.imageUrlMobile} />}
            <img
              src={item.imageUrl}
              alt=""
              className={styles.bgImg}
              loading="eager"
              fetchPriority="high"
              decoding="async"
            />
          </picture>
        ) : (
          <div className={styles.bgImg} style={{ background: gradient }} />
        )}
        <div className={styles.scrim} />
      </div>

      <div className={styles.copy}>
        <div className={styles.copyInner}>
          {eyebrow && <p className={styles.eyebrow}>{eyebrow}</p>}
          {item.heading && <h1 className={styles.heading}>{item.heading}</h1>}
          {item.subheading && <p className={styles.subheading}>{item.subheading}</p>}
          {item.ctaLabel && (
            <div className={styles.ctaRow}>
              {href ? (
                <Link to={href} className={styles.cta}>
                  {item.ctaLabel}
                  <ArrowIcon />
                </Link>
              ) : (
                <span className={styles.cta}>
                  {item.ctaLabel}
                  <ArrowIcon />
                </span>
              )}
              <Link to="/about" className={styles.secondaryCta}>
                Explore Our Story
                <ArrowIcon />
              </Link>
            </div>
          )}
        </div>

        <div className={styles.trustRow}>
          <div className={styles.trustItem}>
            <span className={styles.trustIcon}>
              <DiamondIcon />
            </span>
            100% Certified Diamonds
          </div>
          <span className={styles.trustSep} />
          <div className={styles.trustItem}>
            <span className={styles.trustIcon}>
              <ExchangeIcon />
            </span>
            Lifetime Exchange
          </div>
          <span className={styles.trustSep} />
          <div className={styles.trustItem}>
            <span className={styles.trustIcon}>
              <ShippingIcon />
            </span>
            Secure &amp; Insured Shipping
          </div>
        </div>
      </div>

      {items.length > 1 && (
        <div className={styles.dots}>
          {items.map((it, i) => (
            <button
              key={it.id}
              type="button"
              className={`${styles.dot} ${i === active ? styles.dotActive : ''}`}
              aria-label={`Show slide ${i + 1}`}
              onClick={() => setActive(i)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ArrowIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

function DiamondIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M6 3h12l4 6-10 12L2 9z" />
      <path d="M2 9h20M9 3l3 6-3 12M15 3l-3 6 3 12" />
    </svg>
  );
}

function ExchangeIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M17 2l4 4-4 4" />
      <path d="M3 11V9a4 4 0 0 1 4-4h14" />
      <path d="M7 22l-4-4 4-4" />
      <path d="M21 13v2a4 4 0 0 1-4 4H3" />
    </svg>
  );
}

function ShippingIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M2 8h11v8H2zM13 11h4l3 3v2h-7z" />
      <circle cx="6" cy="18" r="1.5" />
      <circle cx="16.5" cy="18" r="1.5" />
    </svg>
  );
}
