import { useState } from 'react';
import type { ProductSize } from '../../api/types';
import { SelectDropdown } from '../../components/SelectDropdown';
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
  onSelect: (_sizeId: string) => void;
  // Overrides the "Size" wording (e.g. "Length" for a chain/necklace) — a
  // product using this axis for something other than a ring size sets this
  // via the admin form. Defaults to "Size", today's behavior. The ring
  // circumference guide below is specific to actual ring sizing, so it only
  // shows for the default label — a length-labeled product just gets no
  // guide rather than a wrong one.
  label?: string;
}

export function SizeSelector({ sizes, selectedSizeId, onSelect, label = 'Size' }: SizeSelectorProps) {
  const [showGuide, setShowGuide] = useState(false);
  const isRingSize = label === 'Size';

  if (sizes.length === 0) return null;

  return (
    <div className={styles.wrap}>
      <div className={styles.row}>
        <label className={styles.label} htmlFor="pdp-size-select">
          Select {label}
        </label>
        {isRingSize && (
          <button type="button" className={styles.guideLink} onClick={() => setShowGuide((v) => !v)}>
            Size Guide
          </button>
        )}
      </div>
      <SelectDropdown
        id="pdp-size-select"
        value={selectedSizeId ?? ''}
        placeholder={`Choose a ${label.toLowerCase()}`}
        options={sizes.map((size) => ({
          value: size.id,
          label: size.label + (size.availableStock > 0 ? ' — In Stock' : ' — Make to Order'),
        }))}
        onChange={onSelect}
      />

      {isRingSize && showGuide && (
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
