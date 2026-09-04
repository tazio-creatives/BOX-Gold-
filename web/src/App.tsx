import { lazy, useEffect } from 'react';
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { ScrollToTop } from './components/ScrollToTop';
import { StorefrontLayout } from './layouts/StorefrontLayout';
import { MinimalLayout } from './layouts/MinimalLayout';
import { AccountLayout } from './layouts/AccountLayout';
import { AuthModalProvider, useAuthModal } from './features/auth/AuthModalContext';
import { HomePage } from './pages/HomePage';
import { PlaceholderPage } from './pages/PlaceholderPage';
import { PLPPage } from './pages/PLPPage';
import { NewArrivalsPage } from './pages/NewArrivalsPage';
import { CollectionPage } from './pages/CollectionPage';
import { PDPPage } from './pages/PDPPage';

// Only the four public SSR route types (Home/PLP/Collection/PDP, plan §1a)
// are ever rendered server-side via renderToString — everything below
// always hits the CSR-only shell path (see web/server/index.js's
// classifyRoute + entry-server.tsx's render()/renderShellHead() split), so
// lazy-loading it can never strand renderToString on an unresolved chunk.
// Splitting it out of the main bundle is what actually shrinks the JS the
// four SSR page types have to parse before they're interactive.
const CartPage = lazy(() => import('./pages/CartPage').then((m) => ({ default: m.CartPage })));
const WishlistPage = lazy(() => import('./pages/WishlistPage').then((m) => ({ default: m.WishlistPage })));
const CheckoutPage = lazy(() => import('./pages/CheckoutPage').then((m) => ({ default: m.CheckoutPage })));
const OrderConfirmationPage = lazy(() =>
  import('./pages/OrderConfirmationPage').then((m) => ({ default: m.OrderConfirmationPage })),
);
const MyOrdersPage = lazy(() => import('./pages/account/MyOrdersPage').then((m) => ({ default: m.MyOrdersPage })));
const OrderDetailPage = lazy(() =>
  import('./pages/account/OrderDetailPage').then((m) => ({ default: m.OrderDetailPage })),
);
const AccountAddressesPage = lazy(() =>
  import('./pages/account/AccountAddressesPage').then((m) => ({ default: m.AccountAddressesPage })),
);
const AccountProfilePage = lazy(() =>
  import('./pages/account/AccountProfilePage').then((m) => ({ default: m.AccountProfilePage })),
);

// Login is a modal (AuthModal), not a page — a stray /login link (an old
// bookmark, a shared URL) just opens that same modal over the homepage
// instead of 404ing via the catch-all route.
function LoginRedirect() {
  const navigate = useNavigate();
  const { openLoginModal } = useAuthModal();
  useEffect(() => {
    openLoginModal();
    navigate('/', { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

export function App() {
  return (
    <AuthModalProvider>
      <ScrollToTop />
      <Routes>
        <Route element={<StorefrontLayout />}>
          <Route path="/" element={<HomePage />} />
          <Route path="/cart" element={<CartPage />} />
          <Route path="/wishlist" element={<WishlistPage />} />
          <Route path="/login" element={<LoginRedirect />} />
          <Route path="/checkout" element={<CheckoutPage />} />

          <Route path="/account" element={<AccountLayout />}>
            <Route index element={<Navigate to="orders" replace />} />
            <Route path="orders" element={<MyOrdersPage />} />
            <Route path="orders/:orderId" element={<OrderDetailPage />} />
            <Route path="addresses" element={<AccountAddressesPage />} />
            <Route path="profile" element={<AccountProfilePage />} />
          </Route>

          <Route path="/collections/:collectionSlug" element={<CollectionPage />} />
          <Route path="/new-arrivals" element={<NewArrivalsPage />} />
          <Route path="/:categorySlug" element={<PLPPage />} />
          <Route path="/:categorySlug/:productSlug" element={<PDPPage />} />
          <Route path="*" element={<PlaceholderPage title="Coming Soon" />} />
        </Route>

        <Route element={<MinimalLayout />}>
          <Route path="/order-confirmation/:orderId" element={<OrderConfirmationPage />} />
        </Route>
      </Routes>
    </AuthModalProvider>
  );
}
