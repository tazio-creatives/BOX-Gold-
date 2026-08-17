import styles from './ViewToggle.module.css';

export type ViewMode = 'grid' | 'list';

function GridIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
  );
}

function ListIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <line x1="4" y1="6" x2="20" y2="6" />
      <line x1="4" y1="12" x2="20" y2="12" />
      <line x1="4" y1="18" x2="20" y2="18" />
    </svg>
  );
}

export function ViewToggle({ value, onChange }: { value: ViewMode; onChange: (mode: ViewMode) => void }) {
  return (
    <div className={styles.toggle} role="group" aria-label="Product view">
      <button
        type="button"
        className={`${styles.button} ${value === 'grid' ? styles.buttonActive : ''}`}
        aria-pressed={value === 'grid'}
        aria-label="Grid view"
        onClick={() => onChange('grid')}
      >
        <GridIcon />
      </button>
      <button
        type="button"
        className={`${styles.button} ${value === 'list' ? styles.buttonActive : ''}`}
        aria-pressed={value === 'list'}
        aria-label="List view"
        onClick={() => onChange('list')}
      >
        <ListIcon />
      </button>
    </div>
  );
}
