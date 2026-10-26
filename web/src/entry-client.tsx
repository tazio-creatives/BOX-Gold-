import { StrictMode } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider, hydrate } from '@tanstack/react-query';
import './index.css';
import { App } from './App';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: 60_000,
    },
  },
});

// Present for the 4 SSR route types (plan §1a); absent on CSR-only routes
// (cart/wishlist/account/login), where the client just fetches normally.
if (window.__REACT_QUERY_STATE__) {
  hydrate(queryClient, window.__REACT_QUERY_STATE__);
}

// Routes web/server sends as an empty shell on purpose (its CSR_ONLY_* lists
// and classifyRoute) — keep in step with web/server/index.js. Only used to
// tell an intentional shell from a server render that failed.
const CLIENT_ONLY_SINGLE_SEGMENT = new Set([
  'cart', 'wishlist', 'login', 'checkout', 'search', 'account',
  'cancellation-policy', 'size-guide', 'careers', 'press',
]);
const CLIENT_ONLY_PREFIXES = ['account', 'order-confirmation'];

function isClientOnlyRoute(pathname: string): boolean {
  if (pathname === '/') return false;
  const segments = pathname.split('/').filter(Boolean);
  if (CLIENT_ONLY_PREFIXES.includes(segments[0])) return true;
  if (segments[0] === 'blog' && segments.length <= 2) return false;
  if (segments.length === 1) return CLIENT_ONLY_SINGLE_SEGMENT.has(segments[0]);
  return segments.length > 2;
}

const container = document.getElementById('root')!;
const app = (
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>
);

// Server-rendered routes arrive with their HTML in #root and are hydrated.
// Client-only routes (cart, wishlist, search, checkout, account, …) arrive
// with an empty #root: there is nothing to hydrate, so render fresh — calling
// hydrateRoot on them failed with React #418 and re-rendered anyway.
if (container.hasChildNodes()) {
  hydrateRoot(container, app);
} else {
  // An empty #root on a route that should be server-rendered means the server
  // render failed and fell back to the shell (also logged server-side as
  // "SSR render failed"). The page still works client-side; say so loudly.
  if (!isClientOnlyRoute(window.location.pathname)) {
    console.error(`[ssr] ${window.location.pathname} arrived without server-rendered HTML; rendering in the browser instead.`);
  }
  createRoot(container).render(app);
}
