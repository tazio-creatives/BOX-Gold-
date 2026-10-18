import { Link } from 'react-router-dom';
import { Breadcrumbs } from '../../components/Breadcrumbs';
import { useHead } from '../../seo/head';
import { breadcrumbJsonLd, faqPageJsonLd, organizationJsonLd } from '../../seo/jsonLd';
import { FAQ_ITEMS } from './faqContent';
import styles from './FaqPage.module.css';

// /faqs — server-rendered (web/server classifies it like /franchise; see
// prefetch.ts), so its title, H1, Q&As and FAQPage JSON-LD are all in the
// HTML search engines receive. Linked from the homepage "Need Help?" panel.
export function FaqPage() {
  useHead({
    title: 'Frequently Asked Questions | BOX DIAMONDS',
    description:
      'Answers about BOX DIAMONDS jewellery: IGI/GIA-certified natural diamonds, BIS-hallmarked 9K and 18K gold, free delivery across India, 7-day returns, buyback and exchange.',
    canonicalPath: '/faqs',
    jsonLd: [
      organizationJsonLd(),
      breadcrumbJsonLd([
        { name: 'Home', path: '/' },
        { name: 'FAQs', path: '/faqs' },
      ]),
      faqPageJsonLd(FAQ_ITEMS),
    ],
  });

  return (
    <div className={styles.page}>
      <Breadcrumbs items={[{ label: 'FAQs' }]} />
      <header className={styles.header}>
        <h1 className={styles.title}>Frequently Asked Questions</h1>
        <p className={styles.intro}>
          Answers about our diamonds, gold purity, shipping, returns, buyback and exchange.
        </p>
      </header>

      <div className={styles.list}>
        {FAQ_ITEMS.map((item) => (
          <div key={item.question} className={styles.item}>
            <h2 className={styles.question}>{item.question}</h2>
            <p className={styles.answer}>{item.answer}</p>
            {item.link && (
              <Link to={item.link.to} className={styles.more}>
                {item.link.label} →
              </Link>
            )}
          </div>
        ))}
      </div>

      <p className={styles.contact}>
        Still have a question? <Link to="/contact">Contact us</Link> — we're happy to help.
      </p>
    </div>
  );
}
