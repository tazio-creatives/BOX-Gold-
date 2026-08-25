import type { GoldColor } from '../../api/types';
import { COLOR_SWATCH } from './goldColorSwatch';
import styles from './ColorSelector.module.css';

interface ColorSelectorProps {
  colors: GoldColor[];
  selectedColor: GoldColor | null;
  onSelect: (_color: GoldColor) => void;
}

export function ColorSelector({ colors, selectedColor, onSelect }: ColorSelectorProps) {
  if (colors.length === 0) return null;

  return (
    <div className={styles.wrap}>
      <span className={styles.label}>Gold Colour</span>
      <div className={styles.row}>
        {colors.map((color) => {
          const swatch = COLOR_SWATCH[color];
          const active = selectedColor === color;
          return (
            <button
              key={color}
              type="button"
              className={active ? styles.cardActive : styles.card}
              aria-pressed={active}
              onClick={() => onSelect(color)}
            >
              <span className={styles.swatch} style={{ background: swatch.hex }} aria-hidden="true" />
              {swatch.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
