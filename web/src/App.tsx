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
import { AllJewelleryPage } from './pages/AllJewelleryPage';
import { RetailPartnerPage } from './pages/RetailPartnerPage';
import { FranchisePage } from './pages/FranchisePage';
// Blog pages are server-rendered too (web/server classifyRoute 'blog'), so
// they must not be lazy: the first render in each server process got the
// Suspense fallback — an empty page with the homepage's <title> and
// canonical — and that HTML was then saved to page_cache.
import { BlogListPage } from './pages/blog/BlogListPage';
// Server-rendered as well (prefetch.ts static pages), so not lazy either.
import { FaqPage } from './pages/faq/FaqPage';
// Server-rendered content pages that stay code-split in the browser.
import { StaticPage } from './seo/staticPages';
import { BlogPostPage } from './pages/blog/BlogPostPage';
import { CollectionPage } from './pages/CollectionPage';
import { PDPPage } from './pages/PDPPage';

// Only the public SSR route types (Home/PLP/Collection/PDP/Blog, plan §1a)
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
          <Route path="/jewellery" element={<AllJewelleryPage />} />
          <Route path="/retail-partner" element={<RetailPartnerPage />} />
          <Route path="/franchise" element={<FranchisePage />} />
          <Route path="/shipping-policy" element={<StaticPage name="shippingPolicy" />} />
          <Route path="/refund-policy" element={<StaticPage name="refundPolicy" />} />
          {/* Same combined Return and Refund Policy page under its other name. */}
          <Route path="/return-policy" element={<StaticPage name="refundPolicy" />} />
          {/* The standalone Cancellation Policy was retired — its terms live in
              the Return and Refund Policy's "Cancellation Before Dispatch"
              section; old links land there instead of a dead page. */}
          <Route path="/cancellation-policy" element={<Navigate to="/refund-policy#cancellation" replace />} />
          <Route path="/privacy-policy" element={<StaticPage name="privacyPolicy" />} />
          <Route path="/terms" element={<StaticPage name="terms" />} />
          {/* Not built yet — a real page here still needs an explicit route
              (even just this placeholder), or the single-segment path falls
              through to /:categorySlug below and renders a confusing
              "category not found" instead of "coming soon". */}
          <Route path="/contact" element={<StaticPage name="contact" />} />
          {/* FAQs / Size Guide / Careers / Press were removed from the site —
              old links go home instead of falling through to /:categorySlug. */}
          <Route path="/faqs" element={<FaqPage />} />
          <Route path="/size-guide" element={<Navigate to="/" replace />} />
          <Route path="/care-guide" element={<StaticPage name="careGuide" />} />
          <Route path="/our-story" element={<StaticPage name="ourStory" />} />
          <Route path="/why-box-diamonds" element={<StaticPage name="whyBoxDiamonds" />} />
          <Route path="/blog" element={<BlogListPage />} />
          <Route path="/blog/:slug" element={<BlogPostPage />} />
          <Route path="/careers" element={<Navigate to="/" replace />} />
          <Route path="/press" element={<Navigate to="/" replace />} />
          <Route path="/sustainability" element={<StaticPage name="sustainability" />} />
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
