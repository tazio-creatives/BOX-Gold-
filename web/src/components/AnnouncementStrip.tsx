import styles from './AnnouncementStrip.module.css';

const MESSAGES = [
  'Free Insured Shipping',
  'Easy Returns',
  'Lifetime Exchange',
  'Certified Jewellery',
];

export function AnnouncementStrip() {
  return (
    <div className={styles.strip}>
      {MESSAGES.map((message, i) => (
        <span key={message} className={styles.item}>
          {message}
          {i < MESSAGES.length - 1 && <span className={styles.dot} aria-hidden="true" />}
        </span>
      ))}
    </div>
  );
}
