import type { GoldColor } from '../../api/types';
import styles from './ColorSelector.module.css';

const COLOR_LABEL: Record<GoldColor, string> = {
  YELLOW: 'Yellow Gold',
  ROSE: 'Rose Gold',
  WHITE: 'White Gold',
};

interface ColorSelectorProps {
  colors: GoldColor[];
  selectedColor: GoldColor | null;
  onSelect: (color: GoldColor) => void;
}

export function ColorSelector({ colors, selectedColor, onSelect }: ColorSelectorProps) {
  if (colors.length === 0) return null;

  return (
    <div className={styles.wrap}>
      <label className={styles.label} htmlFor="pdp-color-select">
        Gold Color
      </label>
      <select
        id="pdp-color-select"
        className={styles.select}
        value={selectedColor ?? ''}
        onChange={(e) => onSelect(e.target.value as GoldColor)}
      >
        <option value="" disabled>
          Choose a color
        </option>
        {colors.map((color) => (
          <option key={color} value={color}>
            {COLOR_LABEL[color]}
          </option>
        ))}
      </select>
    </div>
  );
}
