import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import type { HomepageItem } from '../../api/types';
import { ProductCard } from '../../components/ProductCard';
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
// (reference mockup), replacing the old plain ProductCarousel usage for
// this section only. The backend now returns one auto item whose
// `.products` array is the newest published products in the full
// ProductCard DTO shape (see homepage.repository.js) — same shape the PLP
// uses — so the existing ProductCard component is reused here directly
// instead of hand-rolled card markup or price math.
const MOBILE_BREAKPOINT = '(max-width: 767px)';
// Same pace as the homepage's other product carousel (ProductCarousel.tsx).
const AUTO_ADVANCE_MS = 4500;
// After a swipe/tap/click, wait this long before auto-scrolling again.
const RESUME_AFTER_TOUCH_MS = 4000;

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
  const trackRef = useRef<HTMLDivElement>(null);
  const productAreaRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [pageCount, setPageCount] = useState(1);

  useEffect(() => {
    const el = trackRef.current;
    if (!el) return undefined;

    function updateScrollState() {
      const node = trackRef.current;
      if (!node) return;
      const page = node.clientWidth || 1;
      setPageCount(Math.max(1, Math.round(node.scrollWidth / page)));
      setActiveIndex(Math.round(node.scrollLeft / page));
    }

    updateScrollState();
    el.addEventListener('scroll', updateScrollState, { passive: true });
    window.addEventListener('resize', updateScrollState);
    return () => {
      el.removeEventListener('scroll', updateScrollState);
      window.removeEventListener('resize', updateScrollState);
    };
  }, [products.length]);

  // Auto-scroll: one card every AUTO_ADVANCE_MS, back to the first card
  // after the last. Never fights the shopper — paused while the pointer is
  // over the products or a card has keyboard focus, and for a few seconds
  // after any swipe/tap/dot click; off entirely for reduced motion.
  useEffect(() => {
    const track = trackRef.current;
    const area = productAreaRef.current;
    if (!track || !area) return undefined;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined;

    let hovered = false;
    let focused = false;
    let touchPaused = false;
    let resumeTimer: ReturnType<typeof setTimeout> | undefined;
    const onEnter = () => {
      hovered = true;
    };
    const onLeave = () => {
      hovered = false;
    };
    const onFocusIn = () => {
      focused = true;
    };
    const onFocusOut = (e: FocusEvent) => {
      focused = area.contains(e.relatedTarget as Node | null);
    };
    const onTouch = () => {
      touchPaused = true;
      clearTimeout(resumeTimer);
      resumeTimer = setTimeout(() => {
        touchPaused = false;
      }, RESUME_AFTER_TOUCH_MS);
    };

    area.addEventListener('mouseenter', onEnter);
    area.addEventListener('mouseleave', onLeave);
    area.addEventListener('focusin', onFocusIn);
    area.addEventListener('focusout', onFocusOut);
    area.addEventListener('touchstart', onTouch, { passive: true });
    area.addEventListener('pointerdown', onTouch);

    const interval = setInterval(() => {
      if (hovered || focused || touchPaused || document.hidden) return;
      const maxScroll = track.scrollWidth - track.clientWidth;
      if (maxScroll <= 4) return; // everything already fits — nothing to scroll
      const slideWidth = track.firstElementChild?.getBoundingClientRect().width ?? 0;
      const gap = parseFloat(getComputedStyle(track).columnGap) || 0;
      const atEnd = track.scrollLeft >= maxScroll - 4;
      track.scrollTo({ left: atEnd ? 0 : track.scrollLeft + slideWidth + gap, behavior: 'smooth' });
    }, AUTO_ADVANCE_MS);

    return () => {
      clearInterval(interval);
      clearTimeout(resumeTimer);
      area.removeEventListener('mouseenter', onEnter);
      area.removeEventListener('mouseleave', onLeave);
      area.removeEventListener('focusin', onFocusIn);
      area.removeEventListener('focusout', onFocusOut);
      area.removeEventListener('touchstart', onTouch);
      area.removeEventListener('pointerdown', onTouch);
    };
  }, [products.length]);

  function scrollToPage(index: number) {
    const el = trackRef.current;
    if (!el) return;
    el.scrollTo({ left: index * el.clientWidth, behavior: 'smooth' });
  }

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

      <div className={styles.productArea} ref={productAreaRef}>
        <div className={styles.productHeader}>
          <Link to={viewAllUrl} className={styles.viewAllLink}>
            View All →
          </Link>
        </div>

        <div className={styles.carouselWrap}>
          <div className={styles.productTrack} ref={trackRef}>
            {products.map((product, i) => (
              <div className={styles.slide} key={product.id}>
                <ProductCard product={product} index={i} imagePadding={false} showNewBadge={false} />
              </div>
            ))}
          </div>
        </div>

        {pageCount > 1 && (
          <div className={styles.dots}>
            {Array.from({ length: pageCount }).map((_, i) => (
              <button
                key={i}
                type="button"
                className={`${styles.dot} ${i === activeIndex ? styles.dotActive : ''}`}
                aria-label={`Show product group ${i + 1}`}
                onClick={() => scrollToPage(i)}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
