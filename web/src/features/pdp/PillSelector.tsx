import styles from './PillSelector.module.css';

interface PillOption {
  value: string;
  label: string;
}

interface PillSelectorProps {
  title: string;
  options: PillOption[];
  selectedValue: string | null;
  onSelect: (value: string) => void;
  // Per-product combination check (from useVariantSelection, driven by that
  // product's actual variants + any Availability Rules) — an option that
  // can't currently be combined with what's already selected on other axes
  // is disabled (not hidden), same treatment as ColorSelector, so the
  // shopper sees why it's blocked instead of it silently disappearing.
  isOptionAvailable?: (value: string) => boolean;
}

// Shared pill-button selector for Purity and Diamond Quality — same
// interaction shape, different option sets and price impact.
export function PillSelector({ title, options, selectedValue, onSelect, isOptionAvailable }: PillSelectorProps) {
  if (options.length === 0) return null;

  const unavailableOption = isOptionAvailable ? options.find((o) => !isOptionAvailable(o.value)) : undefined;

  return (
    <div className={styles.wrap}>
      <span className={styles.label}>{title}</span>
      <div className={styles.row}>
        {options.map((option) => {
          const active = selectedValue === option.value;
          const available = isOptionAvailable ? isOptionAvailable(option.value) : true;
          return (
            <button
              key={option.value}
              type="button"
              className={active ? styles.pillActive : available ? styles.pill : styles.pillDisabled}
              aria-pressed={active}
              aria-disabled={!available}
              disabled={!available}
              onClick={() => available && onSelect(option.value)}
            >
              {option.label}
            </button>
          );
        })}
      </div>
      {unavailableOption && (
        <p className={styles.unavailableNote}>
          {unavailableOption.label} isn&apos;t available with your other selections for this product.
        </p>
      )}
    </div>
  );
}
