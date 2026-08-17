import { useState } from 'react';
import type { ProductSize } from '../../api/types';
import styles from './SizeSelector.module.css';

// Generic, universal reference chart — not per-product data, just a common
// international ring-size lookup so "Size Guide" isn't a dead link.
const SIZE_GUIDE_ROWS: [string, string][] = [
  ['5', '49.3 mm'],
  ['6', '51.9 mm'],
  ['7', '54.4 mm'],
  ['8', '57.0 mm'],
  ['9', '59.5 mm'],
  ['10', '62.1 mm'],
];

interface SizeSelectorProps {
  sizes: ProductSize[];
  selectedSizeId: string | null;
  onSelect: (sizeId: string) => void;
}

export function SizeSelector({ sizes, selectedSizeId, onSelect }: SizeSelectorProps) {
  const [showGuide, setShowGuide] = useState(false);

  if (sizes.length === 0) return null;

  return (
    <div className={styles.wrap}>
      <div className={styles.row}>
        <label className={styles.label} htmlFor="pdp-size-select">
          Select Size
        </label>
        <button type="button" className={styles.guideLink} onClick={() => setShowGuide((v) => !v)}>
          Size Guide
        </button>
      </div>
      <select
        id="pdp-size-select"
        className={styles.select}
        value={selectedSizeId ?? ''}
        onChange={(e) => onSelect(e.target.value)}
      >
        <option value="" disabled>
          Choose a size
        </option>
        {sizes.map((size) => (
          <option key={size.id} value={size.id} disabled={size.availableStock <= 0}>
            {size.label}
            {size.availableStock <= 0 ? ' — Out of stock' : ''}
          </option>
        ))}
      </select>

      {showGuide && (
        <div className={styles.guidePopover} role="dialog" aria-label="Size guide">
          <div className={styles.guideHeader}>
            <span>Ring Size Guide</span>
            <button type="button" className={styles.guideClose} onClick={() => setShowGuide(false)} aria-label="Close">
              ×
            </button>
          </div>
          <table className={styles.guideTable}>
            <thead>
              <tr>
                <th>Size</th>
                <th>Inner circumference</th>
              </tr>
            </thead>
            <tbody>
              {SIZE_GUIDE_ROWS.map(([size, circumference]) => (
                <tr key={size}>
                  <td>{size}</td>
                  <td>{circumference}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className={styles.guideNote}>
            Not sure of your size? Wrap a strip of paper around your finger and measure against a ruler.
          </p>
        </div>
      )}
    </div>
  );
}
