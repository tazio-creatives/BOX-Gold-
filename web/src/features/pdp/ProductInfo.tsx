import { useRef, useState } from 'react';
import type { GoldColor, ProductDetail } from '../../api/types';
import { formatPrice } from '../../utils/formatPrice';
import { DeliveryChecker } from './DeliveryChecker';
import { SizeSelector } from './SizeSelector';
import { ColorSelector } from './ColorSelector';
import { PillSelector } from './PillSelector';
import styles from './ProductInfo.module.css';

function StarRow({ ratingAvg }: { ratingAvg: number }) {
  const filled = Math.round(ratingAvg);
  return (
    <span className={styles.stars} aria-hidden="true">
      {Array.from({ length: 5 }).map((_, i) => (
        <svg key={i} width="15" height="15" viewBox="0 0 24 24" fill={i < filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.5">
          <path d="M12 2.5l2.9 6.3 6.9.7-5.2 4.7 1.5 6.8L12 17.8l-6.1 3.2 1.5-6.8-5.2-4.7 6.9-.7L12 2.5z" />
        </svg>
      ))}
    </span>
  );
}

function BagIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M6 8h12l-1 12H7L6 8z" />
      <path d="M9 8V6a3 3 0 0 1 6 0v2" />
    </svg>
  );
}

function BoltIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M13 2L4 14h6l-1 8 9-12h-6l1-8z" strokeLinejoin="round" />
    </svg>
  );
}

interface ProductInfoProps {
  product: ProductDetail;
  isOutOfStock: boolean;
  isLowStock: boolean;
  justAdded: boolean;
  isAddingToCart: boolean;
  selectedSizeId: string | null;
  onSelectSize: (sizeId: string) => void;
  selectedGoldColor: GoldColor | null;
  onSelectGoldColor: (color: GoldColor) => void;
  selectedPurity: string | null;
  onSelectPurity: (purity: string) => void;
  selectedDiamondConfigId: string | null;
  onSelectDiamondConfigId: (id: string) => void;
  displayPrice: number;
  displayMrp: number;
  displayDiscount: number;
  onAddToCart: () => void;
  onBuyNow: () => void;
}

export function ProductInfo({
  product,
  isOutOfStock,
  isLowStock,
  justAdded,
  isAddingToCart,
  selectedSizeId,
  onSelectSize,
  selectedGoldColor,
  onSelectGoldColor,
  selectedPurity,
  onSelectPurity,
  selectedDiamondConfigId,
  onSelectDiamondConfigId,
  displayPrice,
  displayMrp,
  displayDiscount,
  onAddToCart,
  onBuyNow,
}: ProductInfoProps) {
  const sizeRequired = product.sizes.length > 0 && !selectedSizeId;
  const colorRequired = product.goldColorOptions.length > 0 && !selectedGoldColor;
  const purityRequired = product.purityOptions.length > 0 && !selectedPurity;
  const diamondRequired = product.diamondOptions.length > 0 && !selectedDiamondConfigId;
  const variantRequired = sizeRequired || colorRequired || purityRequired || diamondRequired;

  // Buttons stay clickable rather than disabled — a missing selection is
  // surfaced as an inline message under the relevant field only once the
  // shopper actually tries to buy, not before.
  const [showValidation, setShowValidation] = useState(false);

  const colorFieldRef = useRef<HTMLDivElement>(null);
  const purityFieldRef = useRef<HTMLDivElement>(null);
  const diamondFieldRef = useRef<HTMLDivElement>(null);
  const sizeFieldRef = useRef<HTMLDivElement>(null);

  // A click that can't proceed (missing variant selection) still needs to
  // *do* something visible — otherwise it just quietly sets a flag and the
  // button looks broken. Scroll to whichever required field is first in the
  // page so the shopper actually sees why nothing happened.
  function scrollToFirstMissingField() {
    const target = colorRequired
      ? colorFieldRef.current
      : purityRequired
        ? purityFieldRef.current
        : diamondRequired
          ? diamondFieldRef.current
          : sizeRequired
            ? sizeFieldRef.current
            : null;
    target?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function handleAddToCart() {
    if (variantRequired) {
      setShowValidation(true);
      scrollToFirstMissingField();
      return;
    }
    onAddToCart();
  }

  function handleBuyNow() {
    if (variantRequired) {
      setShowValidation(true);
      scrollToFirstMissingField();
      return;
    }
    onBuyNow();
  }

  const metalLabel = product.metalType === 'GOLD' ? 'Gold' : 'Platinum';
  const summaryParts: string[] = [];
  summaryParts.push(product.purity ? `Metal: ${product.purity} ${metalLabel}` : `Metal: ${metalLabel}`);
  if (product.purity) summaryParts.push(`Purity: ${product.purity}`);
  if (product.productSize) summaryParts.push(`Size: ${product.productSize}`);

  return (
    <div className={styles.info}>
      {product.isNew && (
        <div className={styles.badges}>
          <span className={styles.badgeNew}>New</span>
        </div>
      )}
      <h1 className={styles.name}>{product.name}</h1>

      {product.ratingCount > 0 && (
        <p className={styles.rating}>
          <StarRow ratingAvg={product.ratingAvg} />
          <span className={styles.ratingValue}>{product.ratingAvg.toFixed(1)}</span>
          <span className={styles.ratingCount}>({product.ratingCount} reviews)</span>
        </p>
      )}

      <p className={styles.price}>
        {formatPrice(displayPrice)}
        {displayDiscount > 0 && (
          <>
            <span className={styles.mrp}>{formatPrice(displayMrp)}</span>
            <span className={styles.discount}>{displayDiscount}% off</span>
          </>
        )}
      </p>
      <p className={styles.taxNote}>Inclusive of all taxes</p>

      {isOutOfStock && <p className={styles.stockOut}>Out of Stock</p>}
      {isLowStock && <p className={styles.stockLow}>Only {product.availableStock} left</p>}

      {product.shortDescription && <p className={styles.description}>{product.shortDescription}</p>}

      <div className={styles.specChips}>
        {summaryParts.map((part) => (
          <span key={part} className={styles.specChip}>
            {part}
          </span>
        ))}
      </div>

      <div className={styles.variantRow}>
        <div className={styles.colorCol} ref={colorFieldRef}>
          <ColorSelector
            colors={product.goldColorOptions}
            selectedColor={selectedGoldColor}
            onSelect={onSelectGoldColor}
          />
          {showValidation && colorRequired && <p className={styles.fieldError}>Please select a gold color</p>}
        </div>

        <div className={styles.variantCol} ref={purityFieldRef}>
          <PillSelector
            title={`Purity${selectedPurity ? `: ${selectedPurity}` : ''}`}
            options={product.purityOptions.map((p) => ({ value: p, label: p }))}
            selectedValue={selectedPurity}
            onSelect={onSelectPurity}
          />
          {showValidation && purityRequired && <p className={styles.fieldError}>Please select a purity</p>}
        </div>
      </div>

      <div className={styles.fieldGroup} ref={diamondFieldRef}>
        <PillSelector
          title="Diamond Quality"
          options={product.diamondOptions.map((d) => ({ value: d.id, label: d.name }))}
          selectedValue={selectedDiamondConfigId}
          onSelect={onSelectDiamondConfigId}
        />
        {showValidation && diamondRequired && <p className={styles.fieldError}>Please select a diamond quality</p>}
      </div>

      <div className={styles.fieldGroup} ref={sizeFieldRef}>
        <SizeSelector sizes={product.sizes} selectedSizeId={selectedSizeId} onSelect={onSelectSize} />
        {showValidation && sizeRequired && <p className={styles.fieldError}>Please select a size</p>}
      </div>

      {product.showDeliveryChecker && <DeliveryChecker />}

      <div className={styles.actions}>
        <button
          type="button"
          className={styles.addToBag}
          disabled={isOutOfStock || isAddingToCart}
          onClick={handleAddToCart}
        >
          <BagIcon />
          {isOutOfStock ? 'Out of Stock' : justAdded ? 'Added ✓' : 'Add to Cart'}
        </button>
        <button type="button" className={styles.buyNow} disabled={isOutOfStock} onClick={handleBuyNow}>
          <BoltIcon />
          Buy Now
        </button>
      </div>
    </div>
  );
}
