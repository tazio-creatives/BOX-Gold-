import { Link } from 'react-router-dom';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { fetchWishlist, removeWishlistItem } from '../api/wishlist';
import { addCartItem } from '../api/cart';
import type { Wishlist } from '../api/types';
import { productUrl } from '../utils/productUrl';
import { formatPrice } from '../utils/formatPrice';
import { placeholderGradient } from '../utils/placeholderGradient';
import { useDocumentTitle } from '../utils/useDocumentTitle';
import styles from './WishlistPage.module.css';
import placeholderStyles from './PlaceholderPage.module.css';

export function WishlistPage() {
  useDocumentTitle('Wishlist');
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({ queryKey: ['wishlist'], queryFn: fetchWishlist });

  const removeMutation = useMutation({
    mutationFn: (productId: string) => removeWishlistItem(productId),
    onSuccess: (wishlist: Wishlist) => queryClient.setQueryData(['wishlist'], wishlist),
  });

  const moveToBagMutation = useMutation({
    mutationFn: async (productId: string) => {
      await addCartItem(productId, 1);
      return removeWishlistItem(productId);
    },
    onSuccess: (wishlist: Wishlist) => {
      queryClient.setQueryData(['wishlist'], wishlist);
      queryClient.invalidateQueries({ queryKey: ['cart'] });
    },
  });

  if (isLoading) {
    return (
      <div className={styles.page} aria-busy="true">
        <h1 className={styles.heading}>Wishlist</h1>
        <div className={styles.grid}>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className={styles.skeletonCard} />
          ))}
        </div>
      </div>
    );
  }

  if (!data || data.items.length === 0) {
    return (
      <div className={placeholderStyles.container}>
        <h1 className={placeholderStyles.heading}>Wishlist</h1>
        <p className={placeholderStyles.body}>Your wishlist is empty.</p>
        <Link to="/" className={styles.continueLink}>
          Continue shopping
        </Link>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <h1 className={styles.heading}>Wishlist</h1>

      <div className={styles.grid}>
        {data.items.map((item, i) => (
          <div key={item.productId} className={styles.card}>
            <Link to={productUrl({ slug: item.slug, categorySlug: item.categorySlug })}>
              <div
                className={styles.image}
                style={item.primaryImageUrl ? undefined : { background: placeholderGradient(i) }}
              >
                {item.primaryImageUrl && (
                  <img src={item.primaryImageUrl} alt={item.name} className={styles.imageTag} />
                )}
              </div>
            </Link>
            <div className={styles.body}>
              <Link
                to={productUrl({ slug: item.slug, categorySlug: item.categorySlug })}
                className={styles.name}
              >
                {item.name}
              </Link>
              <p className={styles.price}>{formatPrice(item.sellingPrice)}</p>

              <button
                type="button"
                className={styles.moveButton}
                disabled={item.availableStock <= 0 || moveToBagMutation.isPending}
                onClick={() => moveToBagMutation.mutate(item.productId)}
              >
                {item.availableStock <= 0 ? 'Out of Stock' : 'Move to Bag'}
              </button>
              <button
                type="button"
                className={styles.removeButton}
                onClick={() => removeMutation.mutate(item.productId)}
              >
                Remove
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
