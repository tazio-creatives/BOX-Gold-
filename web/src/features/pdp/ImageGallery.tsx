import { useRef, useState, type MouseEvent } from 'react';
import type { ProductImage } from '../../api/types';
import { placeholderGradient } from '../../utils/placeholderGradient';
import { WishlistButton } from '../../components/WishlistButton';
import styles from './ImageGallery.module.css';

// Each uploaded photo is stored as several rows sharing one sortOrder — one
// per size (thumbnail/small/medium/large/original) and, for large, one per
// format (avif/webp). Grouping by sortOrder collapses that back into one
// displayable photo instead of showing every format/size as a duplicate
// thumbnail.
// AVIF first — same visual quality at a smaller (or at worst equal) file
// size than WebP, since it's the newer, more efficient codec; WebP is only
// a fallback for the rare browser without AVIF support (all evergreen
// browsers — Chrome/Firefox/Edge/Safari 16+ — decode it natively).
function pickUrl(rows: ProductImage[], preferredVariant: string): string | undefined {
  return (
    rows.find((r) => r.variant === preferredVariant && r.format === 'avif')?.url ??
    rows.find((r) => r.variant === preferredVariant && r.format === 'webp')?.url ??
    rows.find((r) => r.variant === preferredVariant)?.url ??
    rows.find((r) => r.variant === 'large' && r.format === 'avif')?.url ??
    rows.find((r) => r.variant === 'large' && r.format === 'webp')?.url ??
    rows.find((r) => r.variant === 'large')?.url ??
    rows.find((r) => r.variant === 'original')?.url ??
    rows[0]?.url
  );
}

interface GalleryPhoto {
  id: string;
  mainUrl: string;
  thumbUrl: string;
}

function groupPhotos(images: ProductImage[]): GalleryPhoto[] {
  const groups = new Map<number, ProductImage[]>();
  for (const img of images) {
    if (!groups.has(img.sortOrder)) groups.set(img.sortOrder, []);
    groups.get(img.sortOrder)!.push(img);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => a - b)
    .map(([, rows]) => ({
      id: rows[0].id,
      mainUrl: pickUrl(rows, 'large') as string,
      thumbUrl: pickUrl(rows, 'small') as string,
    }))
    .filter((photo) => !!photo.mainUrl);
}

export function ImageGallery({
  images,
  productName,
  productId,
  isNew,
}: {
  images: ProductImage[];
  productName: string;
  productId: string;
  isNew: boolean;
}) {
  const displayImages = groupPhotos(images);
  const [activeIndex, setActiveIndex] = useState(0);
  const [isZooming, setIsZooming] = useState(false);
  const [zoomPos, setZoomPos] = useState({ x: 50, y: 50 });
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const mainRef = useRef<HTMLDivElement>(null);

  const handleMouseMove = (e: MouseEvent<HTMLDivElement>) => {
    const rect = mainRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    setZoomPos({ x: Math.min(100, Math.max(0, x)), y: Math.min(100, Math.max(0, y)) });
  };

  // No upload flow exists yet (Phase 9/15) — every product renders this
  // gradient placeholder today, same convention as ProductCard/BentoCard.
  if (displayImages.length === 0) {
    return (
      <div className={styles.gallery}>
        <div className={styles.main}>
          <div
            className={styles.placeholder}
            style={{ background: placeholderGradient(0) }}
            role="img"
            aria-label={productName}
          />
          <div className={styles.overlayBadges}>{isNew && <span className={styles.badgeNew}>New</span>}</div>
          <WishlistButton productId={productId} className={styles.overlayWishlist} />
        </div>
      </div>
    );
  }

  const goPrev = () => setActiveIndex((i) => (i - 1 + displayImages.length) % displayImages.length);
  const goNext = () => setActiveIndex((i) => (i + 1) % displayImages.length);

  const activeUrl = displayImages[activeIndex].mainUrl;

  return (
    <div className={styles.gallery}>
      <div
        ref={mainRef}
        className={styles.main}
        onMouseEnter={() => setIsZooming(true)}
        onMouseLeave={() => setIsZooming(false)}
        onMouseMove={handleMouseMove}
        onClick={() => setLightboxOpen(true)}
      >
        <img src={activeUrl} alt={productName} className={styles.mainImage} />
        {isZooming && (
          <div
            className={styles.zoomPane}
            style={{ backgroundImage: `url(${activeUrl})`, backgroundPosition: `${zoomPos.x}% ${zoomPos.y}%` }}
          />
        )}
        <div className={styles.overlayBadges}>{isNew && <span className={styles.badgeNew}>New</span>}</div>
        <WishlistButton productId={productId} className={styles.overlayWishlist} />
        <button
          type="button"
          className={styles.zoomHint}
          aria-label="View larger image"
          onClick={(e) => {
            e.stopPropagation();
            setLightboxOpen(true);
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="7" />
            <path d="M21 21l-4.35-4.35" />
            <path d="M11 8v6M8 11h6" />
          </svg>
        </button>
      </div>
      {displayImages.length > 1 && (
        <div className={styles.thumbRow}>
          <button type="button" className={styles.navButton} onClick={goPrev} aria-label="Previous image">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>
          <div className={styles.thumbs}>
            {displayImages.map((img, i) => (
              <button
                key={img.id}
                type="button"
                className={i === activeIndex ? styles.thumbActive : styles.thumb}
                onClick={() => setActiveIndex(i)}
                aria-label={`View image ${i + 1}`}
              >
                <img src={img.thumbUrl} alt="" />
              </button>
            ))}
          </div>
          <button type="button" className={styles.navButton} onClick={goNext} aria-label="Next image">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 18l6-6-6-6" />
            </svg>
          </button>
        </div>
      )}
      {lightboxOpen && (
        <div className={styles.lightboxOverlay} onClick={() => setLightboxOpen(false)}>
          <button
            type="button"
            className={styles.lightboxClose}
            aria-label="Close"
            onClick={() => setLightboxOpen(false)}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
          {displayImages.length > 1 && (
            <button
              type="button"
              className={`${styles.lightboxNav} ${styles.lightboxNavPrev}`}
              aria-label="Previous image"
              onClick={(e) => {
                e.stopPropagation();
                goPrev();
              }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M15 18l-6-6 6-6" />
              </svg>
            </button>
          )}
          <img
            src={activeUrl}
            alt={productName}
            className={styles.lightboxImage}
            onClick={(e) => e.stopPropagation()}
          />
          {displayImages.length > 1 && (
            <button
              type="button"
              className={`${styles.lightboxNav} ${styles.lightboxNavNext}`}
              aria-label="Next image"
              onClick={(e) => {
                e.stopPropagation();
                goNext();
              }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9 18l6-6-6-6" />
              </svg>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
