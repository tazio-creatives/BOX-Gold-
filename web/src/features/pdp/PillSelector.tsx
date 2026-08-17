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
}

// Shared pill-button selector for Purity and Diamond Quality — same
// interaction shape, different option sets and price impact.
export function PillSelector({ title, options, selectedValue, onSelect }: PillSelectorProps) {
  if (options.length === 0) return null;

  return (
    <div className={styles.wrap}>
      <span className={styles.label}>{title}</span>
      <div className={styles.row}>
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            className={selectedValue === option.value ? styles.pillActive : styles.pill}
            aria-pressed={selectedValue === option.value}
            onClick={() => onSelect(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}
