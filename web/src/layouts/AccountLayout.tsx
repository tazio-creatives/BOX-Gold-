import { Suspense } from 'react';
import { NavLink, Outlet, Navigate, useLocation } from 'react-router-dom';
import { useCustomer } from '../features/auth/useCustomer';
import { RouteFallback } from '../components/RouteFallback';
import styles from './AccountLayout.module.css';

export function AccountLayout() {
  const { isLoggedIn, isLoading } = useCustomer();
  const location = useLocation();

  if (!isLoading && !isLoggedIn) {
    return <Navigate to={`/login?redirect=${encodeURIComponent(location.pathname)}`} replace />;
  }

  if (isLoading) return null;

  return (
    <div className={styles.page}>
      <h1 className={styles.heading}>My Account</h1>
      <div className={styles.layout}>
        <nav className={styles.nav} aria-label="Account">
          <NavLink to="/account/orders" className={({ isActive }) => (isActive ? styles.navLinkActive : styles.navLink)}>
            Orders
          </NavLink>
          <NavLink to="/account/addresses" className={({ isActive }) => (isActive ? styles.navLinkActive : styles.navLink)}>
            Addresses
          </NavLink>
        </nav>
        <div className={styles.content}>
          <Suspense fallback={<RouteFallback />}>
            <Outlet />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
