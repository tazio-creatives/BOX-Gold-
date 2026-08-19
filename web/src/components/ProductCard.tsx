import { Link } from 'react-router-dom';
import type { ProductCard as ProductCardType } from '../api/types';
import { productUrl } from '../utils/productUrl';
import { formatPrice } from '../utils/formatPrice';
import { placeholderGradient } from '../utils/placeholderGradient';
import { WishlistButton } from './WishlistButton';
import styles from './ProductCard.module.css';

const LOW_STOCK_THRESHOLD = 3;

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
          {product.discountPercent > 0 && (
            <>
              <span className={styles.mrp}>{formatPrice(product.mrp)}</span>
              <span className={styles.discountPill}>{product.discountPercent}% off</span>
            </>
          )}
        </p>
      </div>
    </Link>
  );
}
