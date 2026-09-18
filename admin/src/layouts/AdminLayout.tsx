import { useState } from 'react';
import { NavLink, Navigate, Outlet } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { logout } from '../api/auth';
import { useAdmin } from '../features/auth/useAdmin';
import { SidebarContext } from './SidebarContext';
import {
  DashboardIcon,
  ProductsIcon,
  CategoriesIcon,
  CollectionsIcon,
  HomepageIcon,
  OrdersIcon,
  CustomersIcon,
  ReviewsIcon,
  CouponsIcon,
  PricingIcon,
  AdminUsersIcon,
  AuditLogsIcon,
  AttributesIcon,
} from './NavIcons';
import styles from './AdminLayout.module.css';

const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', end: true, icon: DashboardIcon },
  // Orders' table wants the full window width (see OrdersListPage's
  // ".full-width-page" opt-out) — collapsing the sidebar on the way in gives
  // it that room immediately instead of waiting on a manual toggle.
  { to: '/orders', label: 'Orders', icon: OrdersIcon, collapseOnClick: true },
  { to: '/products', label: 'Products', icon: ProductsIcon },
  { to: '/categories', label: 'Categories', icon: CategoriesIcon },
  { to: '/collections', label: 'Collections', icon: CollectionsIcon },
  { to: '/homepage', label: 'Homepage', icon: HomepageIcon },
  { to: '/customers', label: 'Customers', icon: CustomersIcon },
  { to: '/reviews', label: 'Reviews', icon: ReviewsIcon },
  { to: '/coupons', label: 'Coupons', icon: CouponsIcon },
  { to: '/pricing', label: 'Pricing', icon: PricingIcon },
  { to: '/attributes', label: 'Attributes', icon: AttributesIcon },
  { to: '/admin-users', label: 'Admin Users', icon: AdminUsersIcon },
  { to: '/audit-logs', label: 'Audit Logs', icon: AuditLogsIcon },
];

const COLLAPSE_STORAGE_KEY = 'admin-sidebar-collapsed';

function CollapseToggleIcon({ collapsed }: { collapsed: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <line x1="10" y1="4" x2="10" y2="20" />
      {collapsed ? <path d="M13.5 9l3 3-3 3" /> : <path d="M16.5 9l-3 3 3 3" />}
    </svg>
  );
}

export function AdminLayout() {
  const { admin, isLoggedIn, isLoading } = useAdmin();
  const queryClient = useQueryClient();
  const [isCollapsed, setIsCollapsed] = useState(
    () => typeof window !== 'undefined' && window.localStorage.getItem(COLLAPSE_STORAGE_KEY) === '1',
  );

  if (!isLoading && !isLoggedIn) {
    return <Navigate to="/login" replace />;
  }

  if (isLoading) return null;

  async function handleLogout() {
    await logout();
    queryClient.setQueryData(['me'], null);
  }

  function toggleCollapsed() {
    setIsCollapsed((prev) => {
      const next = !prev;
      window.localStorage.setItem(COLLAPSE_STORAGE_KEY, next ? '1' : '0');
      return next;
    });
  }

  function collapseSidebar() {
    setIsCollapsed(true);
    window.localStorage.setItem(COLLAPSE_STORAGE_KEY, '1');
  }

  const initial = admin?.fullName?.trim().charAt(0).toUpperCase() ?? '?';

  return (
    <div className={`${styles.shell} ${isCollapsed ? styles.shellCollapsed : ''}`}>
      <aside className={`${styles.sidebar} ${isCollapsed ? styles.sidebarCollapsed : ''}`}>
        <div className={styles.brandRow}>
          {!isCollapsed && (
            <div className={styles.brand}>
              <img src="/images/logo-sidebar.png" alt="Box Diamonds" className={styles.brandLogo} />
            </div>
          )}
          <button
            type="button"
            className={styles.collapseToggle}
            onClick={toggleCollapsed}
            aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            <CollapseToggleIcon collapsed={isCollapsed} />
          </button>
        </div>
        <nav className={styles.nav}>
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => (isActive ? styles.navLinkActive : styles.navLink)}
              title={isCollapsed ? item.label : undefined}
              onClick={item.collapseOnClick ? collapseSidebar : undefined}
            >
              <item.icon />
              {!isCollapsed && item.label}
            </NavLink>
          ))}
        </nav>
        <div className={styles.footer}>
          <div className={styles.adminIdentity}>
            <div className={styles.avatar} title={isCollapsed ? admin?.fullName : undefined}>
              {initial}
            </div>
            {!isCollapsed && (
              <div>
                <p className={styles.adminName}>{admin?.fullName}</p>
                <p className={styles.adminRole}>{admin?.role.name}</p>
              </div>
            )}
          </div>
          <button
            type="button"
            className={styles.logoutButton}
            onClick={handleLogout}
            title={isCollapsed ? 'Sign Out' : undefined}
          >
            {isCollapsed ? '⏻' : 'Sign Out'}
          </button>
        </div>
      </aside>
      <main className={styles.content}>
        <SidebarContext.Provider value={{ isCollapsed, collapseSidebar }}>
          <Outlet />
        </SidebarContext.Provider>
      </main>
    </div>
  );
}
