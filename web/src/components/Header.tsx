import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { SearchBar } from '../features/search/SearchBar';
import { fetchCart } from '../api/cart';
import { fetchWishlist } from '../api/wishlist';
import { useCustomer } from '../features/auth/useCustomer';
import styles from './Header.module.css';

// No traditional category nav menu (plan §2) — logo, search, wishlist,
// account, cart only. Becomes compact/sticky on scroll.
export function Header() {
  const [isScrolled, setIsScrolled] = useState(false);
  const { isLoggedIn } = useCustomer();

  // Deliberately client-only, not part of SSR prefetch (plan §1a scopes SSR
  // to Home/PLP/Collection/PDP content only) — badge counts populate just
  // after hydration, which is fine since they carry no SEO value.
  const { data: cart } = useQuery({ queryKey: ['cart'], queryFn: fetchCart, staleTime: 30_000 });
  const { data: wishlist } = useQuery({
    queryKey: ['wishlist'],
    queryFn: fetchWishlist,
    staleTime: 30_000,
  });
  const cartCount = cart?.itemCount ?? 0;
  const wishlistCount = wishlist?.items.length ?? 0;

  useEffect(() => {
    const onScroll = () => setIsScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header className={`${styles.header} ${isScrolled ? styles.scrolled : ''}`}>
      <div className={styles.inner}>
        <Link to="/" className={styles.logo} aria-label="Box Diamonds — home">
          <span className={styles.logoBox}>BOX</span>
          <span className={styles.logoRule} aria-hidden="true" />
          <span className={styles.logoDiamonds}>DIAMONDS</span>
        </Link>

        <SearchBar />

        <nav className={styles.actions} aria-label="Account actions">
          <Link to="/wishlist" className={styles.actionLink}>
            <span className={styles.iconWrap}>
              <HeartIcon />
              {wishlistCount > 0 && <span className={styles.badge}>{wishlistCount}</span>}
            </span>
            <span className={styles.actionLabel}>Wishlist</span>
          </Link>
          <Link to={isLoggedIn ? '/account/orders' : '/login'} className={styles.actionLink}>
            <span className={styles.iconWrap}>
              <UserIcon />
            </span>
            <span className={styles.actionLabel}>{isLoggedIn ? 'Account' : 'My Account'}</span>
          </Link>
          <Link to="/cart" className={styles.actionLink}>
            <span className={styles.iconWrap}>
              <BagIcon />
              {cartCount > 0 && <span className={styles.badge}>{cartCount}</span>}
            </span>
            <span className={styles.actionLabel}>Cart</span>
          </Link>
        </nav>
      </div>
    </header>
  );
}

function HeartIcon() {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
    >
      <path d="M12 21s-7.5-4.7-10-9.3C.5 8.1 2.3 4.5 6 4c2-.3 3.7.6 6 3 2.3-2.4 4-3.3 6-3 3.7.5 5.5 4.1 4 7.7C19.5 16.3 12 21 12 21z" />
    </svg>
  );
}

function UserIcon() {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
    >
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c1.5-4 5-6 8-6s6.5 2 8 6" />
    </svg>
  );
}

function BagIcon() {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
    >
      <path d="M6 8h12l-1 12H7L6 8z" />
      <path d="M9 8V6a3 3 0 0 1 6 0v2" />
    </svg>
  );
}
