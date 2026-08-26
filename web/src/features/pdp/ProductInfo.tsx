import { useEffect, useRef, useState } from 'react';
import type { GoldColor, ProductDetail } from '../../api/types';
import { formatPrice } from '../../utils/formatPrice';
import { DeliveryChecker } from './DeliveryChecker';
import { SizeSelector } from './SizeSelector';
import { ColorSelector } from './ColorSelector';
import { COLOR_SWATCH } from './goldColorSwatch';
import { PillSelector } from './PillSelector';
import styles from './ProductInfo.module.css';

function StarRow({ ratingAvg }: { ratingAvg: number }) {
  const filled = Math.round(ratingAvg);
  return (
    <span className={styles.stars} aria-hidden="true">
      {Array.from({ length: 5 }).map((_, i) => (
        <svg key={i} width="14" height="14" viewBox="0 0 24 24" fill={i < filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.5">
          <path d="M12 2.5l2.9 6.3 6.9.7-5.2 4.7 1.5 6.8L12 17.8l-6.1 3.2 1.5-6.8-5.2-4.7 6.9-.7L12 2.5z" />
        </svg>
      ))}
    </span>
  );
}

function BagIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M6 8h12l-1 12H7L6 8z" />
      <path d="M9 8V6a3 3 0 0 1 6 0v2" />
    </svg>
  );
}

function BoltIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M13 2L4 14h6l-1 8 9-12h-6l1-8z" strokeLinejoin="round" />
    </svg>
  );
}

function ChevronDownIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function TagIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <path d="M20.5 12.5L12.5 20.5a1.5 1.5 0 0 1-2.1 0l-7-7a1.5 1.5 0 0 1 0-2.1L11.4 3.4a2 2 0 0 1 1.4-.6H19a2 2 0 0 1 2 2v6.6a2 2 0 0 1-.5 1.5z" strokeLinejoin="round" />
      <circle cx="16" cy="7" r="1.5" />
    </svg>
  );
}

function SparkleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3z" strokeLinejoin="round" />
      <path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15z" strokeLinejoin="round" />
    </svg>
  );
}

function PencilIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" strokeLinejoin="round" />
    </svg>
  );
}

function DiamondChipIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <path d="M6 8h12l3 4-9 9-9-9 3-4z" strokeLinejoin="round" />
      <path d="M9 8l3 13 3-13M3 8h18" strokeLinejoin="round" />
    </svg>
  );
}

interface SelectionSummaryProps {
  parts: string[];
  collapsed: boolean;
  onEdit?: () => void;
}

// The same "what's currently picked" line, in two shapes: sitting at the
// bottom of the expanded customization panel (nothing more to do — the
// controls are right above it), or standing in for the whole panel once
// collapsed, with an Edit affordance to reopen it.
function SelectionSummary({ parts, collapsed, onEdit }: SelectionSummaryProps) {
  if (parts.length === 0) return null;
  const text = parts.join(' · ');

  if (!collapsed) {
    return (
      <p className={styles.selectionSummary}>
        <span className={styles.selectionSummaryLabel}>Selected:</span> {text}
      </p>
    );
  }

  return (
    <div className={styles.selectionSummaryRow}>
      <p className={styles.selectionSummary}>
        <span className={styles.selectionSummaryLabel}>Current selection:</span> {text}
      </p>
      <button type="button" className={styles.editLink} onClick={() => onEdit?.()}>
        Edit <PencilIcon />
      </button>
    </div>
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
  offerLabel: string | null;
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
  offerLabel,
  onAddToCart,
  onBuyNow,
}: ProductInfoProps) {
  const sizeRequired = product.sizes.length > 0 && !selectedSizeId;
  const colorRequired = product.goldColorOptions.length > 0 && !selectedGoldColor;
  const purityRequired = product.purityOptions.length > 0 && !selectedPurity;
  const diamondRequired = product.diamondOptions.length > 0 && !selectedDiamondConfigId;
  const variantRequired = sizeRequired || colorRequired || purityRequired || diamondRequired;

  // The admin's "Customer-Selectable Variations" (Gold Color / Purity /
  // Diamond Quality / Size) — tucked behind a "Customize Design" toggle so
  // the PDP stays uncluttered for the (common) products with a single fixed
  // configuration, where none of these options exist at all.
  const hasCustomizations =
    product.goldColorOptions.length > 0 ||
    product.purityOptions.length > 0 ||
    product.diamondOptions.length > 0 ||
    product.sizes.length > 0;
  const [customizeOpen, setCustomizeOpen] = useState(false);

  // Buttons stay clickable rather than disabled — a missing selection is
  // surfaced as an inline message under the relevant field only once the
  // shopper actually tries to buy, not before.
  const [showValidation, setShowValidation] = useState(false);

  const colorFieldRef = useRef<HTMLDivElement>(null);
  const purityFieldRef = useRef<HTMLDivElement>(null);
  const diamondFieldRef = useRef<HTMLDivElement>(null);
  const sizeFieldRef = useRef<HTMLDivElement>(null);

  // Mobile sticky purchase bar: mirrors Add to Cart/Buy Now once the
  // original inline buttons scroll out of view, and stays visible the rest
  // of the way down the page — including over the footer — so a shopper
  // can always buy without scrolling back up. Conditionally rendering
  // (rather than just CSS-hiding) it means a screen reader never sees two
  // "Add to Cart" controls at once.
  const actionsRef = useRef<HTMLDivElement>(null);
  const [showStickyBar, setShowStickyBar] = useState(false);

  useEffect(() => {
    const actionsEl = actionsRef.current;
    if (!actionsEl) return undefined;

    const actionsObserver = new IntersectionObserver(([entry]) => {
      setShowStickyBar(!entry.isIntersecting);
    });
    actionsObserver.observe(actionsEl);

    return () => actionsObserver.disconnect();
  }, []);

  // A click that can't proceed (missing variant selection) still needs to
  // *do* something visible — otherwise it just quietly sets a flag and the
  // button looks broken. Scroll to whichever required field is first in the
  // page so the shopper actually sees why nothing happened.
  function scrollToFirstMissingField() {
    const needsCustomizePanel = colorRequired || purityRequired || diamondRequired || sizeRequired;
    if (needsCustomizePanel && !customizeOpen) {
      // The fields aren't in the DOM yet while the panel is collapsed —
      // open it and wait a frame so the refs below actually resolve.
      setCustomizeOpen(true);
      requestAnimationFrame(scrollToFirstMissingField);
      return;
    }
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

  // Quick-glance chips (no size) — reflect whatever's currently selected,
  // falling back to the product's own base attributes for axes that aren't
  // customer-selectable at all.
  const chipGoldColor = selectedGoldColor ?? product.goldColor;
  const chipPurity = selectedPurity ?? product.purity;
  const metalChipText = [chipPurity, chipGoldColor ? COLOR_SWATCH[chipGoldColor].label : metalLabel]
    .filter(Boolean)
    .join(' ');

  const selectedDiamondOption = product.diamondOptions.find((d) => d.id === selectedDiamondConfigId) ?? null;
  const diamondChipText = selectedDiamondOption?.name ?? product.diamondConfigName;

  // The fuller "Selected: ..." line inside/under the customize panel — only
  // includes axes that are actually customer-selectable for this product.
  const selectedSize = product.sizes.find((s) => s.id === selectedSizeId) ?? null;
  const summaryParts = [
    product.goldColorOptions.length > 0 ? (selectedGoldColor ? COLOR_SWATCH[selectedGoldColor].label : null) : null,
    product.purityOptions.length > 0 ? selectedPurity : null,
    product.diamondOptions.length > 0 ? (selectedDiamondOption?.name ?? null) : null,
    product.sizes.length > 0 ? (selectedSize ? `Size ${selectedSize.label}` : null) : null,
  ].filter((p): p is string => !!p);

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
        {displayDiscount > 0 && <span className={styles.mrp}>{formatPrice(displayMrp)}</span>}
      </p>
      <p className={styles.taxNote}>Inclusive of all taxes</p>

      {offerLabel && (
        <div className={styles.offerCard}>
          <span className={styles.offerLeft}>
            <span className={styles.offerIcon}>
              <TagIcon />
            </span>
            <span className={styles.offerHeadline}>{offerLabel}</span>
          </span>
          <span className={styles.offerNote}>Limited-period offer</span>
        </div>
      )}

      {isOutOfStock && (
        <p className={styles.stockBackorder}>Make to Order — ships in 7–10 working days</p>
      )}
      {!isOutOfStock && isLowStock && (
        <p className={styles.stockLow}>Only {product.availableStock} left · Delivery in 5 days</p>
      )}
      {!isOutOfStock && !isLowStock && (
        <p className={styles.stockInfo}>In Stock · Delivery in 5 days</p>
      )}

      {product.shortDescription && <p className={styles.description}>{product.shortDescription}</p>}

      {metalChipText && (
        <div className={styles.specChips}>
          {metalChipText && (
            <span className={styles.specChip}>
              <span
                className={styles.specChipDot}
                style={chipGoldColor ? { background: COLOR_SWATCH[chipGoldColor].hex } : undefined}
                aria-hidden="true"
              />
              {metalChipText}
            </span>
          )}
          {diamondChipText && (
            <span className={styles.specChip}>
              <DiamondChipIcon />
              {diamondChipText} Diamond
            </span>
          )}
        </div>
      )}

      {hasCustomizations && (
        <div className={styles.customizeSection}>
          <button
            type="button"
            className={styles.customizeToggle}
            aria-expanded={customizeOpen}
            onClick={() => setCustomizeOpen((open) => !open)}
          >
            <span className={styles.customizeToggleIcon}>
              <SparkleIcon />
            </span>
            <span className={styles.customizeToggleText}>
              <span className={styles.customizeTitle}>Customize Your Design</span>
              <span className={styles.customizeSubtitle}>Choose gold colour, purity, diamond quality and size</span>
            </span>
            <span className={customizeOpen ? styles.customizeChevronOpen : styles.customizeChevron} aria-hidden="true">
              <ChevronDownIcon />
            </span>
          </button>

          {customizeOpen ? (
            <div className={styles.customizePanel}>
              {product.goldColorOptions.length > 0 && (
                <div className={styles.fieldGroup} ref={colorFieldRef}>
                  <ColorSelector
                    colors={product.goldColorOptions}
                    selectedColor={selectedGoldColor}
                    onSelect={onSelectGoldColor}
                  />
                  {showValidation && colorRequired && (
                    <p className={styles.fieldError}>Please select a gold color</p>
                  )}
                </div>
              )}

              {product.purityOptions.length > 0 && (
                <div className={styles.fieldGroup} ref={purityFieldRef}>
                  <PillSelector
                    title="Gold Purity"
                    options={product.purityOptions.map((p) => ({ value: p, label: p }))}
                    selectedValue={selectedPurity}
                    onSelect={onSelectPurity}
                  />
                  {showValidation && purityRequired && <p className={styles.fieldError}>Please select a purity</p>}
                </div>
              )}

              {product.diamondOptions.length > 0 && (
                <div className={styles.fieldGroup} ref={diamondFieldRef}>
                  <PillSelector
                    title="Diamond Quality"
                    options={product.diamondOptions.map((d) => ({ value: d.id, label: d.name }))}
                    selectedValue={selectedDiamondConfigId}
                    onSelect={onSelectDiamondConfigId}
                  />
                  {showValidation && diamondRequired && (
                    <p className={styles.fieldError}>Please select a diamond quality</p>
                  )}
                </div>
              )}

              {product.sizes.length > 0 && (
                <div className={styles.fieldGroup} ref={sizeFieldRef}>
                  <SizeSelector sizes={product.sizes} selectedSizeId={selectedSizeId} onSelect={onSelectSize} />
                  {showValidation && sizeRequired && <p className={styles.fieldError}>Please select a size</p>}
                </div>
              )}

              <SelectionSummary parts={summaryParts} collapsed={false} />
            </div>
          ) : (
            <SelectionSummary parts={summaryParts} collapsed onEdit={() => setCustomizeOpen(true)} />
          )}
        </div>
      )}

      <div className={styles.actions} ref={actionsRef}>
        <button
          type="button"
          className={styles.addToBag}
          disabled={isAddingToCart}
          onClick={handleAddToCart}
        >
          <BagIcon />
          {justAdded ? 'Added ✓' : 'Add to Cart'}
        </button>
        <button type="button" className={styles.buyNow} onClick={handleBuyNow}>
          <BoltIcon />
          Buy Now
        </button>
      </div>

      {product.showDeliveryChecker && <DeliveryChecker isBackordered={isOutOfStock} />}

      {showStickyBar && (
        <div className={styles.mobileBar}>
          <div className={styles.mobileBarInner}>
            <div className={styles.mobileBarPrice}>
              <span className={styles.mobileBarPriceCurrent}>{formatPrice(displayPrice)}</span>
              {displayDiscount > 0 && (
                <span className={styles.mobileBarPriceOld}>{formatPrice(displayMrp)}</span>
              )}
              <span className={styles.mobileBarTax}>Inclusive of all taxes</span>
            </div>
            {offerLabel && (
              <div className={styles.mobileBarOfferCard}>
                <span className={styles.offerLeft}>
                  <span className={styles.offerIcon}>
                    <TagIcon />
                  </span>
                  <span className={styles.offerHeadline}>{offerLabel}</span>
                </span>
                <span className={styles.offerNote}>Limited-period offer</span>
              </div>
            )}
            <div className={styles.mobileBarActions}>
              <button
                type="button"
                className={styles.mobileBarAddToBag}
                disabled={isAddingToCart}
                onClick={handleAddToCart}
              >
                <BagIcon />
                {justAdded ? 'Added ✓' : 'Add to Cart'}
              </button>
              <button type="button" className={styles.mobileBarBuyNow} onClick={handleBuyNow}>
                <BoltIcon />
                Buy Now
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
