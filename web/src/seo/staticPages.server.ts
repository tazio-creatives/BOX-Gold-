import { ShippingPolicyPage } from '../pages/policies/ShippingPolicyPage';
import { RefundPolicyPage } from '../pages/policies/RefundPolicyPage';
import { ContactPage } from '../pages/ContactPage';
import { OurStoryPage } from '../pages/OurStoryPage';
import { WhyBoxDiamondsPage } from '../pages/WhyBoxDiamondsPage';
import type { StaticPageMap } from './staticPages';

// Server only (imported by entry-server.tsx): the same pages as direct
// imports, so renderToString renders them fully on every request. See
// staticPages.tsx for why the browser gets lazy versions instead.
export const serverStaticPages: StaticPageMap = {
  shippingPolicy: ShippingPolicyPage,
  refundPolicy: RefundPolicyPage,
  contact: ContactPage,
  ourStory: OurStoryPage,
  whyBoxDiamonds: WhyBoxDiamondsPage,
};
