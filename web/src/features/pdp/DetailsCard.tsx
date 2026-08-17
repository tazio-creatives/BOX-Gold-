import { useEffect, useRef, useState, type ReactNode } from 'react';
import styles from './DetailsCard.module.css';

const COLLAPSED_HEIGHT = 240;

interface DetailsCardProps {
  title: string;
  children: ReactNode;
  className?: string;
}

// Both PDP detail cards (Product Details / Price Breakup) share this so they
// always render at the same height — whichever has more rows gets clipped
// with a "View More" toggle instead of stretching the shorter card's box.
export function DetailsCard({ title, children, className }: DetailsCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [overflowing, setOverflowing] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = contentRef.current;
    if (el) setOverflowing(el.scrollHeight > COLLAPSED_HEIGHT + 1);
  }, [children]);

  return (
    <section className={className ? `${styles.card} ${className}` : styles.card}>
      <h2 className={styles.heading}>{title}</h2>
      <div
        ref={contentRef}
        className={`${styles.content} ${!expanded && overflowing ? styles.fade : ''}`}
        style={expanded ? undefined : { maxHeight: COLLAPSED_HEIGHT }}
      >
        {children}
      </div>
      {overflowing && (
        <button type="button" className={styles.toggle} onClick={() => setExpanded((v) => !v)}>
          {expanded ? 'View Less' : 'View More'}
        </button>
      )}
    </section>
  );
}
