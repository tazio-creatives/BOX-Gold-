import { useEffect, useRef, useState, type TouchEvent as ReactTouchEvent } from 'react';
import { Link } from 'react-router-dom';
import type { HomepageItem } from '../../api/types';
import { placeholderGradient } from '../../utils/placeholderGradient';
import styles from './HeroCarousel.module.css';

const ROTATE_MS = 6000;
const SWIPE_THRESHOLD_PX = 40;
// Kept in sync with the media query in HeroCarousel.module.css — the
// <source> breakpoint below must match the CSS one, otherwise the browser
// and the layout would switch images at different widths.
const MOBILE_BREAKPOINT = '(max-width: 767px)';

// The uploaded banner image already contains its own heading/description/
// CTA artwork, so there is nothing visible to label it with — this is
// screen-reader-only text, never rendered on the page itself.
function ariaLabelFor(item: HomepageItem): string {
  return item.name || item.category?.name || item.collection?.name || item.product?.name || 'Promotional banner';
}

// Downloads an image into the browser cache without showing it, so a later
// <img> with the same URL paints immediately.
function warmImage(url: string) {
  const img = new Image();
  img.decoding = 'async';
  img.src = url;
}

interface HeroCarouselProps {
  items: HomepageItem[];
  // True for the page's first hero only — its first slide is the main
  // above-the-fold image (LCP), so it's fetched eagerly at high priority.
  // A hero further down the page (admin can add more than one) loads
  // lazily instead of competing with it for bandwidth.
  priority?: boolean;
}

export function HeroCarousel({ items, priority = true }: HeroCarouselProps) {
  const [active, setActive] = useState(0);
  const [isHovering, setIsHovering] = useState(false);
  const [isTouching, setIsTouching] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const touchStartX = useRef<number | null>(null);
  const touchDeltaX = useRef(0);
  const wrapRef = useRef<HTMLDivElement>(null);

  const hasMultiple = items.length > 1;
  const isPaused = isHovering || isTouching || isFocused;

  function goTo(index: number) {
    setActive(((index % items.length) + items.length) % items.length);
  }
  const next = () => goTo(active + 1);
  const prev = () => goTo(active - 1);

  useEffect(() => {
    if (!hasMultiple || isPaused) return;
    const id = window.setInterval(() => {
      setActive((prev) => (prev + 1) % items.length);
    }, ROTATE_MS);
    return () => window.clearInterval(id);
  }, [items.length, hasMultiple, isPaused]);

  // Once the page has finished loading, quietly fetch the NEXT slide's image
  // (the one this screen size will actually use) so auto-rotation shows it
  // instantly. Without this the next slide only started downloading when it
  // became active — blank for a moment on slow phones, and that late paint
  // was what Lighthouse measured as the page's LCP.
  useEffect(() => {
    if (!hasMultiple) return;
    const upcoming = items[(active + 1) % items.length];
    if (!upcoming?.imageUrl) return;
    const url =
      upcoming.imageUrlMobile && window.matchMedia(MOBILE_BREAKPOINT).matches
        ? upcoming.imageUrlMobile
        : upcoming.imageUrl;
    if (document.readyState === 'complete') {
      warmImage(url);
      return;
    }
    const onLoad = () => warmImage(url);
    window.addEventListener('load', onLoad, { once: true });
    return () => window.removeEventListener('load', onLoad);
  }, [active, items, hasMultiple]);

  // Pause while browser focus is anywhere inside the slider (keyboard users
  // tabbing to the prev/next buttons or the banner link itself).
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    function onFocusIn() {
      setIsFocused(true);
    }
    function onFocusOut(e: FocusEvent) {
      if (!el?.contains(e.relatedTarget as Node)) setIsFocused(false);
    }
    el.addEventListener('focusin', onFocusIn);
    el.addEventListener('focusout', onFocusOut);
    return () => {
      el.removeEventListener('focusin', onFocusIn);
      el.removeEventListener('focusout', onFocusOut);
    };
  }, []);

  function onTouchStart(e: ReactTouchEvent) {
    touchStartX.current = e.touches[0].clientX;
    touchDeltaX.current = 0;
    setIsTouching(true);
  }
  function onTouchMove(e: ReactTouchEvent) {
    if (touchStartX.current == null) return;
    touchDeltaX.current = e.touches[0].clientX - touchStartX.current;
  }
  function onTouchEnd() {
    if (touchDeltaX.current > SWIPE_THRESHOLD_PX) prev();
    else if (touchDeltaX.current < -SWIPE_THRESHOLD_PX) next();
    touchStartX.current = null;
    touchDeltaX.current = 0;
    setIsTouching(false);
  }

  const item = items[active];
  if (!item) return null;
  const gradient = placeholderGradient(active);
  const label = ariaLabelFor(item);
  // No separately-uploaded mobile image — the desktop image stands in on
  // mobile too, but must render at its own natural ratio (never forced into
  // the 4:5 portrait frame, which would crop it) — see .mediaWrapFallback.
  const isMobileFallback = !item.imageUrlMobile;

  const media = item.imageUrl ? (
    <picture>
      {item.imageUrlMobile && <source media={MOBILE_BREAKPOINT} srcSet={item.imageUrlMobile} />}
      <img
        src={item.imageUrl}
        alt={`${label} — BOX DIAMONDS`}
        className={styles.bgImg}
        loading={priority ? 'eager' : 'lazy'}
        fetchPriority={priority && active === 0 ? 'high' : undefined}
        decoding="async"
      />
    </picture>
  ) : (
    <div className={styles.bgImg} style={{ background: gradient }} />
  );

  const mediaWrapClass = `${styles.mediaWrap} ${isMobileFallback ? styles.mediaWrapFallback : ''}`;
  const touchHandlers = { onTouchStart, onTouchMove, onTouchEnd };

  return (
    <div
      className={styles.hero}
      ref={wrapRef}
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}
    >
      {item.redirectUrl ? (
        <Link
          to={item.redirectUrl}
          target={item.openInNewTab ? '_blank' : undefined}
          rel={item.openInNewTab ? 'noopener noreferrer' : undefined}
          className={mediaWrapClass}
          aria-label={label}
          {...touchHandlers}
        >
          {media}
        </Link>
      ) : (
        <div className={mediaWrapClass} aria-label={label} role="img" {...touchHandlers}>
          {media}
        </div>
      )}

      {hasMultiple && (
        <div className={styles.dotsRow}>
          {items.map((it, i) => (
            <button
              key={it.id}
              type="button"
              className={`${styles.dot} ${i === active ? styles.dotActive : ''}`}
              aria-label={`Show slide ${i + 1}`}
              onClick={() => goTo(i)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
