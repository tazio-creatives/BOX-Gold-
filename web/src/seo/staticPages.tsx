import { createContext, lazy, useContext, type ComponentType } from 'react';

// Content pages that are server-rendered for SEO (own title, description,
// canonical in the initial HTML) but stay code-split in the browser.
//
// They can't simply be React.lazy everywhere: renderToString can't wait for
// a lazy chunk, so the server's first render of each page in a process got
// the Suspense fallback (the blog pages had exactly this bug). Nor can they
// be plain imports in App.tsx: that would add ~28 KB gzipped to the main
// bundle every visitor downloads. So the page set is swapped by context —
// lazy by default (browser), direct imports provided by entry-server.tsx via
// staticPages.server.ts. While a lazy chunk loads during hydration, React
// keeps the server's HTML on screen, so there's no flash.
export type StaticPageName =
  | 'shippingPolicy'
  | 'refundPolicy'
  | 'contact'
  | 'ourStory'
  | 'whyBoxDiamonds'
  | 'privacyPolicy'
  | 'terms'
  | 'careGuide'
  | 'sustainability';

export type StaticPageMap = Record<StaticPageName, ComponentType>;

const lazyPages: StaticPageMap = {
  shippingPolicy: lazy(() =>
    import('../pages/policies/ShippingPolicyPage').then((m) => ({ default: m.ShippingPolicyPage })),
  ),
  refundPolicy: lazy(() => import('../pages/policies/RefundPolicyPage').then((m) => ({ default: m.RefundPolicyPage }))),
  contact: lazy(() => import('../pages/ContactPage').then((m) => ({ default: m.ContactPage }))),
  ourStory: lazy(() => import('../pages/OurStoryPage').then((m) => ({ default: m.OurStoryPage }))),
  whyBoxDiamonds: lazy(() =>
    import('../pages/WhyBoxDiamondsPage').then((m) => ({ default: m.WhyBoxDiamondsPage })),
  ),
  privacyPolicy: lazy(() =>
    import('../pages/policies/PrivacyPolicyPage').then((m) => ({ default: m.PrivacyPolicyPage })),
  ),
  terms: lazy(() => import('../pages/policies/TermsPage').then((m) => ({ default: m.TermsPage }))),
  careGuide: lazy(() => import('../pages/CareGuidePage').then((m) => ({ default: m.CareGuidePage }))),
  sustainability: lazy(() => import('../pages/SustainabilityPage').then((m) => ({ default: m.SustainabilityPage }))),
};

export const StaticPagesContext = createContext<StaticPageMap>(lazyPages);

export function StaticPage({ name }: { name: StaticPageName }) {
  const Page = useContext(StaticPagesContext)[name];
  return <Page />;
}
