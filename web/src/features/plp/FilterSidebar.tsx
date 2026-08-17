import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { GoldColor, MetalType, Purity } from '../../api/types';
import { PriceRangeSlider } from './PriceRangeSlider';
import styles from './FilterSidebar.module.css';

const KARATS: Purity[] = ['14K', '18K', '22K'];

const METAL_OPTIONS: { label: string; metal: MetalType; goldColor: GoldColor | null }[] = [
  { label: 'Yellow Gold', metal: 'GOLD', goldColor: 'YELLOW' },
  { label: 'Rose Gold', metal: 'GOLD', goldColor: 'ROSE' },
  { label: 'White Gold', metal: 'GOLD', goldColor: 'WHITE' },
  { label: 'Platinum', metal: 'PLATINUM', goldColor: null },
];

export interface FilterValues {
  metal?: MetalType;
  purity?: Purity;
  goldColor?: GoldColor;
  priceMin?: number;
  priceMax?: number;
}

export interface CategoryFilterGroup {
  currentLabel: string;
  total: number;
  items: { name: string; href: string; slug: string; count: number }[];
}

interface FilterSidebarProps {
  values: FilterValues;
  onChange: (patch: FilterValues) => void;
  onClear: () => void;
  categoryFilter?: CategoryFilterGroup;
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      className={styles.chevron}
      style={{ transform: open ? 'rotate(180deg)' : 'none' }}
    >
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

function FilterGroup({ title, children }: { title: string; children: ReactNode }) {
  const [open, setOpen] = useState(true);
  return (
    <div className={styles.group}>
      <button type="button" className={styles.groupHeadingButton} onClick={() => setOpen((o) => !o)}>
        <span className={styles.groupHeading}>{title}</span>
        <ChevronIcon open={open} />
      </button>
      {open && <div className={styles.groupBody}>{children}</div>}
    </div>
  );
}

export function FilterSidebar({ values, onChange, onClear, categoryFilter }: FilterSidebarProps) {
  const hasActiveFilters =
    values.metal != null || values.purity != null || values.goldColor != null ||
    values.priceMin != null || values.priceMax != null;

  const selectedMetalOption = METAL_OPTIONS.find(
    (m) => m.metal === values.metal && m.goldColor === (values.goldColor ?? null),
  );

  return (
    <aside className={styles.sidebar}>
      {categoryFilter && (
        <FilterGroup title="Category">
          <ul className={styles.checkList}>
            <li className={styles.checkItem}>
              <span className={`${styles.checkbox} ${styles.checkboxChecked}`} aria-hidden="true" />
              <span className={styles.checkLabel}>All {categoryFilter.currentLabel}</span>
              <span className={styles.checkCount}>{categoryFilter.total}</span>
            </li>
            {categoryFilter.items.map((item) => (
              <li key={item.href} className={styles.checkItem}>
                <Link to={item.href} className={styles.checkItemLink}>
                  <span className={styles.checkbox} aria-hidden="true" />
                  <span className={styles.checkLabel}>{item.name}</span>
                  <span className={styles.checkCount}>{item.count}</span>
                </Link>
              </li>
            ))}
          </ul>
        </FilterGroup>
      )}

      <FilterGroup title="Price Range">
        <PriceRangeSlider
          valueMin={values.priceMin}
          valueMax={values.priceMax}
          onCommit={(priceMin, priceMax) => onChange({ priceMin, priceMax })}
        />
      </FilterGroup>

      <FilterGroup title="Metal">
        <ul className={styles.checkList}>
          {METAL_OPTIONS.map((option) => {
            const isChecked = selectedMetalOption === option;
            return (
              <li key={option.label} className={styles.checkItem}>
                <button
                  type="button"
                  className={styles.checkItemButton}
                  onClick={() =>
                    onChange(
                      isChecked
                        ? { metal: undefined, goldColor: undefined }
                        : { metal: option.metal, goldColor: option.goldColor ?? undefined },
                    )
                  }
                >
                  <span className={`${styles.checkbox} ${isChecked ? styles.checkboxChecked : ''}`} aria-hidden="true" />
                  <span className={styles.checkLabel}>{option.label}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </FilterGroup>

      <FilterGroup title="Karat">
        <ul className={styles.checkList}>
          {KARATS.map((karat) => {
            const isChecked = values.purity === karat;
            return (
              <li key={karat} className={styles.checkItem}>
                <button
                  type="button"
                  className={styles.checkItemButton}
                  onClick={() => onChange({ purity: isChecked ? undefined : karat })}
                >
                  <span className={`${styles.checkbox} ${isChecked ? styles.checkboxChecked : ''}`} aria-hidden="true" />
                  <span className={styles.checkLabel}>{karat}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </FilterGroup>

      {hasActiveFilters && (
        <button type="button" className={styles.clearButton} onClick={onClear}>
          Clear all filters
        </button>
      )}
    </aside>
  );
}
