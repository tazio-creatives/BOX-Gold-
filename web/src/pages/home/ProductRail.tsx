import { useEffect, useRef, useState } from 'react';
import type { ProductCard as ProductCardData } from '../../api/types';
import { ProductCard } from '../../components/ProductCard';
import styles from './ProductRail.module.css';

// One card every AUTO_ADVANCE_MS.
const AUTO_ADVANCE_MS = 4500;
// After a swipe/tap/click, wait this long before auto-scrolling again.
const RESUME_AFTER_TOUCH_MS = 4000;

// Horizontally scrolling row of standard product cards with page dots and
// auto-scroll — shared by the homepage's New Arrivals and Featured Products
// sections. Card width is the caller's (`slideClassName`), since each
// section shows a different number per view.
export function ProductRail({
  products,
  slideClassName,
  className,
}: {
  products: ProductCardData[];
  slideClassName: string;
  className?: string;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const railRef = useRef<HTMLDivElement>(null);
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
  // over the row or a card has keyboard focus, and for a few seconds after
  // any swipe/tap/dot click; off entirely for reduced motion.
  useEffect(() => {
    const track = trackRef.current;
    const area = railRef.current;
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

  return (
    <div className={className} ref={railRef}>
      <div className={styles.track} ref={trackRef}>
        {products.map((product, i) => (
          <div className={`${styles.slide} ${slideClassName}`} key={product.id}>
            <ProductCard product={product} index={i} imagePadding={false} showNewBadge={false} />
          </div>
        ))}
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
  );
}
