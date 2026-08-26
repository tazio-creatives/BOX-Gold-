import { Link } from 'react-router-dom';
import type { ProductCard as ProductCardType } from '../api/types';
import { productUrl } from '../utils/productUrl';
import { formatPrice } from '../utils/formatPrice';
import { effectiveMrp } from '../utils/effectiveMrp';
import { placeholderGradient } from '../utils/placeholderGradient';
import { WishlistButton } from './WishlistButton';
import styles from './ProductCard.module.css';

const LOW_STOCK_THRESHOLD = 3;

function TagIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <path d="M20.5 12.5L12.5 20.5a1.5 1.5 0 0 1-2.1 0l-7-7a1.5 1.5 0 0 1 0-2.1L11.4 3.4a2 2 0 0 1 1.4-.6H19a2 2 0 0 1 2 2v6.6a2 2 0 0 1-.5 1.5z" strokeLinejoin="round" />
      <circle cx="16" cy="7" r="1.5" />
    </svg>
  );
}

export function ProductCard({
  product,
  index = 0,
  layout = 'grid',
  imageFit = 'cover',
  imageHeight,
}: {
  product: ProductCardType;
  index?: number;
  layout?: 'grid' | 'list';
  imageFit?: 'cover' | 'contain';
  // Opt-in fixed-height image area (PLP grid spec) — omitted, every other
  // caller keeps the default aspect-ratio-based sizing untouched.
  imageHeight?: string;
}) {
  const isOutOfStock = product.availableStock <= 0;
  const isLowStock = !isOutOfStock && product.availableStock <= LOW_STOCK_THRESHOLD;
  const { strikePrice } = effectiveMrp(
    product.sellingPrice,
    product.mrp,
    product.sellingPriceOriginal,
  );

  return (
    <Link to={productUrl(product)} className={`${styles.card} ${layout === 'list' ? styles.cardList : ''}`}>
      <div
        className={`${styles.image} ${layout === 'list' ? styles.imageList : ''}`}
        style={{
          ...(product.primaryImageUrl ? undefined : { background: placeholderGradient(index) }),
          ...(imageHeight && layout === 'grid' ? { height: imageHeight, aspectRatio: 'auto' } : undefined),
        }}
      >
        {product.primaryImageUrl && (
          <img
            src={product.primaryImageUrl}
            alt={product.name}
            className={styles.imageTag}
            style={{ objectFit: imageFit }}
          />
        )}
        <div className={styles.badges}>
          {product.isNew && <span className={styles.badgeNew}>New</span>}
          {isOutOfStock && <span className={styles.badgeOut}>Out of Stock</span>}
          {isLowStock && <span className={styles.badgeLow}>Only {product.availableStock} left</span>}
        </div>
        <WishlistButton productId={product.id} className={styles.wishlistButton} />
      </div>
      <div className={styles.body}>
        {product.purity && (
          <p className={styles.meta}>
            {product.purity} {product.metalType === 'GOLD' ? 'Gold' : 'Platinum'}
          </p>
        )}
        {!product.purity && <p className={styles.meta}>{product.metalType === 'GOLD' ? 'Gold' : 'Platinum'}</p>}
        <h3 className={styles.name}>{product.name}</h3>
        {product.ratingCount > 0 && (
          <p className={styles.rating}>
            ★ {product.ratingAvg.toFixed(1)}{' '}
            <span className={styles.ratingCount}>({product.ratingCount})</span>
          </p>
        )}
        <p className={styles.price}>
          {formatPrice(product.sellingPrice)}
          {strikePrice > 0 && <span className={styles.mrp}>{formatPrice(strikePrice)}</span>}
        </p>
        {product.offerLabel && (
          <div className={styles.offerBanner}>
            <span className={styles.offerBannerLeft}>
              <span className={styles.offerBannerIcon}>
                <TagIcon />
              </span>
              <span className={styles.offerBannerHeadline}>{product.offerLabel}</span>
            </span>
            <span className={styles.offerBannerNote}>Limited-period offer</span>
          </div>
        )}
      </div>
    </Link>
  );
}
