import type { GoldColor } from '../../api/types';
import { SelectDropdown } from '../../components/SelectDropdown';
import styles from './ColorSelector.module.css';

const COLOR_LABEL: Record<GoldColor, string> = {
  YELLOW: 'Yellow Gold',
  ROSE: 'Rose Gold',
  WHITE: 'White Gold',
};

interface ColorSelectorProps {
  colors: GoldColor[];
  selectedColor: GoldColor | null;
  onSelect: (_color: GoldColor) => void;
}

export function ColorSelector({ colors, selectedColor, onSelect }: ColorSelectorProps) {
  if (colors.length === 0) return null;

  return (
    <div className={styles.wrap}>
      <label className={styles.label} htmlFor="pdp-color-select">
        Gold Color
      </label>
      <SelectDropdown
        id="pdp-color-select"
        value={selectedColor ?? ''}
        placeholder="Choose a color"
        options={colors.map((color) => ({ value: color, label: COLOR_LABEL[color] }))}
        onChange={(value) => onSelect(value as GoldColor)}
      />
    </div>
  );
}
