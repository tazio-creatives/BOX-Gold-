import { useState } from 'react';
import { ShieldIcon, PackageIcon, HeartIcon } from './AuthIcons';
import styles from './AuthVisualPanel.module.css';

// Purely presentational — no state besides image-load tracking, no API
// calls. Hidden entirely below the mobile breakpoint (see .module.css),
// matching the reference's recommended mobile content order which skips
// straight from the header to "WELCOME BACK".
export function AuthVisualPanel() {
  const [imageFailed, setImageFailed] = useState(false);

  return (
    <div className={styles.panel}>
      {/* Real <img> (not a CSS background) for alt text + standard responsive
          image loading, per the accessibility requirements. Until a licensed
          lifestyle photo is placed at this path, unmounting on error (rather
          than leaving a broken <img> in the DOM) avoids the browser's
          broken-image glyph/alt-text bleeding through on top of the overlay —
          the panel's own neutral fallback background (see .module.css) shows
          through cleanly instead. */}
      {!imageFailed && (
        <img
          src="/images/auth-hero.jpg"
          alt="A woman wearing an elegant diamond necklace and matching earrings"
          className={styles.image}
          loading="eager"
          decoding="async"
          onError={() => setImageFailed(true)}
        />
      )}
      <div className={styles.overlay} aria-hidden="true" />
      <div className={styles.content}>
        <h2 className={styles.heading}>
          Welcome to <span className={styles.brand}>BOX DIAMONDS</span>
        </h2>
        <p className={styles.tagline}>Your favourites, orders and exclusive pieces—all in one place.</p>
        <ul className={styles.benefits}>
          <li className={styles.benefit}>
            <ShieldIcon />
            <span>Secure sign-in</span>
          </li>
          <li className={styles.benefit}>
            <PackageIcon />
            <span>Easy order tracking</span>
          </li>
          <li className={styles.benefit}>
            <HeartIcon />
            <span>Personalised favourites</span>
          </li>
        </ul>
      </div>
    </div>
  );
}
