import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useDocumentTitle } from '../../utils/useDocumentTitle';
import styles from './PolicyLayout.module.css';

// Shared shell for every long-form legal page (Shipping, Refund,
// Cancellation, and any future Privacy/Terms page) — keeps the title/
// "Last Updated" line/breadcrumb/typography identical across all of them
// without each page re-declaring its own layout.
export function PolicyLayout({
  title,
  lastUpdated,
  children,
}: {
  title: string;
  lastUpdated: string;
  children: ReactNode;
}) {
  useDocumentTitle(title);

  return (
    <div className={styles.page}>
      <nav className={styles.breadcrumb} aria-label="Breadcrumb">
        <Link to="/">Home</Link>
        <span aria-hidden="true"> / </span>
        <span>{title}</span>
      </nav>
      <h1 className={styles.heading}>{title}</h1>
      <p className={styles.lastUpdated}>Last Updated: {lastUpdated}</p>
      <div className={styles.content}>{children}</div>
    </div>
  );
}
