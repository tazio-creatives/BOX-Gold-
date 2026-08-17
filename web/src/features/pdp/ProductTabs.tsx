import { useState, type KeyboardEvent } from 'react';
import type { ProductDetail } from '../../api/types';
import { ReviewsSection } from './ReviewsSection';
import styles from './ProductTabs.module.css';

type TabId = 'description' | 'reviews';

export function ProductTabs({ product }: { product: ProductDetail }) {
  const tabs: { id: TabId; label: string }[] = [
    { id: 'description', label: 'Description' },
    { id: 'reviews', label: product.ratingCount > 0 ? `Reviews (${product.ratingCount})` : 'Reviews' },
  ];
  const [active, setActive] = useState<TabId>('description');

  function handleKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const currentIndex = tabs.findIndex((t) => t.id === active);
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      setActive(tabs[(currentIndex + 1) % tabs.length].id);
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      setActive(tabs[(currentIndex - 1 + tabs.length) % tabs.length].id);
    }
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.tabListWrap}>
        <div className={styles.tabList} role="tablist" aria-label="Product information" onKeyDown={handleKeyDown}>
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              id={`pdp-tab-${tab.id}`}
              aria-selected={active === tab.id}
              aria-controls={`pdp-panel-${tab.id}`}
              tabIndex={active === tab.id ? 0 : -1}
              className={active === tab.id ? styles.tabActive : styles.tab}
              onClick={() => setActive(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div
        role="tabpanel"
        id="pdp-panel-description"
        aria-labelledby="pdp-tab-description"
        hidden={active !== 'description'}
        className={styles.panel}
      >
        {product.fullDescription && <p className={styles.description}>{product.fullDescription}</p>}
        {product.careInstructions && (
          <>
            <h3 className={styles.subheading}>Care Instructions</h3>
            <p className={styles.description}>{product.careInstructions}</p>
          </>
        )}
        {!product.fullDescription && !product.careInstructions && (
          <p className={styles.empty}>No description available for this piece yet.</p>
        )}
      </div>

      <div
        role="tabpanel"
        id="pdp-panel-reviews"
        aria-labelledby="pdp-tab-reviews"
        hidden={active !== 'reviews'}
        className={styles.panel}
      >
        <ReviewsSection productId={product.id} />
      </div>
    </div>
  );
}
