import { lazy } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { ScrollToTop } from './components/ScrollToTop';
import { StorefrontLayout } from './layouts/StorefrontLayout';
import { AccountLayout } from './layouts/AccountLayout';
import { HomePage } from './pages/HomePage';
import { PlaceholderPage } from './pages/PlaceholderPage';
import { PLPPage } from './pages/PLPPage';
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
const LoginPage = lazy(() => import('./pages/LoginPage').then((m) => ({ default: m.LoginPage })));
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

export function App() {
  return (
    <>
      <ScrollToTop />
      <Routes>
        <Route element={<StorefrontLayout />}>
          <Route path="/" element={<HomePage />} />
          <Route path="/cart" element={<CartPage />} />
          <Route path="/wishlist" element={<WishlistPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/checkout" element={<CheckoutPage />} />
          <Route path="/order-confirmation/:orderId" element={<OrderConfirmationPage />} />

          <Route path="/account" element={<AccountLayout />}>
            <Route index element={<Navigate to="orders" replace />} />
            <Route path="orders" element={<MyOrdersPage />} />
            <Route path="orders/:orderId" element={<OrderDetailPage />} />
            <Route path="addresses" element={<AccountAddressesPage />} />
          </Route>

          <Route path="/collections/:collectionSlug" element={<CollectionPage />} />
          <Route path="/:categorySlug" element={<PLPPage />} />
          <Route path="/:categorySlug/:productSlug" element={<PDPPage />} />
          <Route path="*" element={<PlaceholderPage title="Coming Soon" />} />
        </Route>
      </Routes>
    </>
  );
}
