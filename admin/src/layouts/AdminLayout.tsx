import { NavLink, Navigate, Outlet } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { logout } from '../api/auth';
import { useAdmin } from '../features/auth/useAdmin';
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
} from './NavIcons';
import styles from './AdminLayout.module.css';

const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', end: true, icon: DashboardIcon },
  { to: '/products', label: 'Products', icon: ProductsIcon },
  { to: '/categories', label: 'Categories', icon: CategoriesIcon },
  { to: '/collections', label: 'Collections', icon: CollectionsIcon },
  { to: '/homepage', label: 'Homepage', icon: HomepageIcon },
  { to: '/orders', label: 'Orders', icon: OrdersIcon },
  { to: '/customers', label: 'Customers', icon: CustomersIcon },
  { to: '/reviews', label: 'Reviews', icon: ReviewsIcon },
  { to: '/coupons', label: 'Coupons', icon: CouponsIcon },
  { to: '/pricing', label: 'Pricing', icon: PricingIcon },
  { to: '/admin-users', label: 'Admin Users', icon: AdminUsersIcon },
  { to: '/audit-logs', label: 'Audit Logs', icon: AuditLogsIcon },
];

export function AdminLayout() {
  const { admin, isLoggedIn, isLoading } = useAdmin();
  const queryClient = useQueryClient();

  if (!isLoading && !isLoggedIn) {
    return <Navigate to="/login" replace />;
  }

  if (isLoading) return null;

  async function handleLogout() {
    await logout();
    queryClient.setQueryData(['me'], null);
  }

  const initial = admin?.fullName?.trim().charAt(0).toUpperCase() ?? '?';

  return (
    <div className={styles.shell}>
      <aside className={styles.sidebar}>
        <div className={styles.brand}>
          BOX <span className={styles.brandAccent}>DIAMONDS</span>
        </div>
        <nav className={styles.nav}>
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => (isActive ? styles.navLinkActive : styles.navLink)}
            >
              <item.icon />
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className={styles.footer}>
          <div className={styles.adminIdentity}>
            <div className={styles.avatar}>{initial}</div>
            <div>
              <p className={styles.adminName}>{admin?.fullName}</p>
              <p className={styles.adminRole}>{admin?.role.name}</p>
            </div>
          </div>
          <button type="button" className={styles.logoutButton} onClick={handleLogout}>
            Sign Out
          </button>
        </div>
      </aside>
      <main className={styles.content}>
        <Outlet />
      </main>
    </div>
  );
}
