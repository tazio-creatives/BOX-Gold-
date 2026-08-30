import type { GoldColor } from '../../api/types';
import { COLOR_SWATCH } from './goldColorSwatch';
import styles from './ColorSelector.module.css';

interface ColorSelectorProps {
  colors: GoldColor[];
  selectedColor: GoldColor | null;
  onSelect: (_color: GoldColor) => void;
  // Purity currently selected elsewhere on the page — some colors aren't
  // manufactured at some purities for a given product; disables (rather
  // than hides) the swatch so the shopper can see the option exists and why
  // it's blocked, instead of a color silently disappearing.
  selectedPurity?: string | null;
  // Real per-product combination check (from useVariantSelection, driven by
  // that product's actual variants) — this component stays generic/
  // product-agnostic itself.
  isColorAvailable: (color: GoldColor, purity: string | null | undefined) => boolean;
}

export function ColorSelector({ colors, selectedColor, onSelect, selectedPurity, isColorAvailable }: ColorSelectorProps) {
  if (colors.length === 0) return null;

  const unavailableColor = colors.find((color) => !isColorAvailable(color, selectedPurity));

  return (
    <div className={styles.wrap}>
      <span className={styles.label}>Gold Colour</span>
      <div className={styles.row}>
        {colors.map((color) => {
          const swatch = COLOR_SWATCH[color];
          const active = selectedColor === color;
          const available = isColorAvailable(color, selectedPurity);
          return (
            <button
              key={color}
              type="button"
              className={active ? styles.cardActive : available ? styles.card : styles.cardDisabled}
              aria-pressed={active}
              aria-disabled={!available}
              disabled={!available}
              onClick={() => available && onSelect(color)}
            >
              <span className={styles.swatch} style={{ background: swatch.hex }} aria-hidden="true" />
              {swatch.label}
            </button>
          );
        })}
      </div>
      {selectedPurity && unavailableColor && (
        <p className={styles.unavailableNote}>
          {COLOR_SWATCH[unavailableColor].label} isn&apos;t available in {selectedPurity} purity for this product.
        </p>
      )}
    </div>
  );
}
