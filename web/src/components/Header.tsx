import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { SearchBar } from '../features/search/SearchBar';
import { fetchCart } from '../api/cart';
import { fetchWishlist } from '../api/wishlist';
import { fetchCategories } from '../api/categories';
import { useCustomer } from '../features/auth/useCustomer';
import { MegaMenu, MobileCategoryList } from './MegaMenu';
import styles from './Header.module.css';

export function Header() {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const mobileMenuRef = useRef<HTMLDivElement>(null);
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

  const { data: categoriesData } = useQuery({ queryKey: ['categories'], queryFn: fetchCategories });
  const categories = categoriesData?.categories ?? [];

  useEffect(() => {
    const onScroll = () => setIsScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Wishlist/Account are hidden as icons-only on the mobile top row (only
  // Cart stays visible there per the mobile layout spec) — this panel is
  // how they stay reachable on mobile, closing on outside click or Escape.
  useEffect(() => {
    if (!isMobileMenuOpen) return;
    function onPointerDown(e: PointerEvent) {
      if (mobileMenuRef.current && !mobileMenuRef.current.contains(e.target as Node)) {
        setIsMobileMenuOpen(false);
      }
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setIsMobileMenuOpen(false);
    }
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [isMobileMenuOpen]);

  return (
    <header className={`${styles.header} ${isScrolled ? styles.scrolled : ''}`}>
      <div className={styles.inner}>
        <div className={styles.menuArea} ref={mobileMenuRef}>
          <button
            type="button"
            className={styles.menuButton}
            aria-label="Open menu"
            aria-expanded={isMobileMenuOpen}
            aria-controls="mobile-menu-panel"
            onClick={() => setIsMobileMenuOpen((v) => !v)}
          >
            <MenuIcon />
          </button>
          {isMobileMenuOpen && (
            <div id="mobile-menu-panel" className={styles.mobileMenuPanel} role="menu">
              <MobileCategoryList categories={categories} onNavigate={() => setIsMobileMenuOpen(false)} />
              <Link
                to="/wishlist"
                className={styles.mobileMenuLink}
                role="menuitem"
                onClick={() => setIsMobileMenuOpen(false)}
              >
                Wishlist{wishlistCount > 0 ? ` (${wishlistCount})` : ''}
              </Link>
              <Link
                to={isLoggedIn ? '/account/orders' : '/login'}
                className={styles.mobileMenuLink}
                role="menuitem"
                onClick={() => setIsMobileMenuOpen(false)}
              >
                {isLoggedIn ? 'Account' : 'My Account'}
              </Link>
            </div>
          )}
        </div>

        <Link to="/" className={styles.logo} aria-label="Box Diamonds — home">
          <img src="/images/logo.png" alt="Box Diamonds" className={styles.logoImg} />
        </Link>

        <div className={styles.searchArea}>
          <SearchBar />
        </div>

        <nav className={styles.actions} aria-label="Account actions">
          <Link to="/wishlist" className={styles.actionLink} aria-label="Wishlist">
            <span className={styles.iconWrap}>
              <HeartIcon />
              {wishlistCount > 0 && <span className={styles.badge}>{wishlistCount}</span>}
            </span>
            <span className={styles.actionLabel}>Wishlist</span>
          </Link>
          <Link
            to={isLoggedIn ? '/account/orders' : '/login'}
            className={styles.actionLink}
            aria-label={isLoggedIn ? 'Account' : 'My Account'}
          >
            <span className={styles.iconWrap}>
              <UserIcon />
            </span>
            <span className={styles.actionLabel}>{isLoggedIn ? 'Account' : 'My Account'}</span>
          </Link>
          <Link to="/cart" className={`${styles.actionLink} ${styles.cartAction}`} aria-label="Cart">
            <span className={styles.iconWrap}>
              <BagIcon />
              {cartCount > 0 && <span className={styles.badge}>{cartCount}</span>}
            </span>
            <span className={styles.actionLabel}>Cart</span>
          </Link>
        </nav>
      </div>

      <MegaMenu categories={categories} />
    </header>
  );
}

function MenuIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <path d="M3 6h18M3 12h18M3 18h18" strokeLinecap="round" />
    </svg>
  );
}

function HeartIcon() {
  return (
    <svg
      width="26"
      height="26"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      aria-hidden="true"
    >
      <path d="M12 21s-7.5-4.7-10-9.3C.5 8.1 2.3 4.5 6 4c2-.3 3.7.6 6 3 2.3-2.4 4-3.3 6-3 3.7.5 5.5 4.1 4 7.7C19.5 16.3 12 21 12 21z" />
    </svg>
  );
}

function UserIcon() {
  return (
    <svg
      width="26"
      height="26"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      aria-hidden="true"
    >
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c1.5-4 5-6 8-6s6.5 2 8 6" />
    </svg>
  );
}

function BagIcon() {
  return (
    <svg
      width="26"
      height="26"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      aria-hidden="true"
    >
      <path d="M6 8h12l-1 12H7L6 8z" />
      <path d="M9 8V6a3 3 0 0 1 6 0v2" />
    </svg>
  );
}
