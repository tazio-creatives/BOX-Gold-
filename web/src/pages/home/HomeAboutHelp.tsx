import { Link } from 'react-router-dom';
import { DeliveryTruckIcon, DiamondIcon, ShieldCheckIcon } from '../../components/assuranceIcons';
import styles from './HomeAboutHelp.module.css';

// Static, homepage-only row at the end of the page (like AssuranceStrip,
// not a homepage_sections row): a short About panel and a "Need Help?"
// panel pointing to the FAQ page and the main policy pages. The About text
// is real HTML (crawlable); the full Q&As live on /faqs.

// Each claim is backed elsewhere on the site: IGI/GIA-certified natural
// diamonds and BIS-hallmarked gold (Why BOX DIAMONDS, FAQ), delivery to
// serviceable PIN codes across India (Shipping Policy).
const ABOUT_HIGHLIGHTS = [
  { Icon: DiamondIcon, label: 'Natural Diamonds' },
  { Icon: ShieldCheckIcon, label: 'Trusted Quality' },
  { Icon: DeliveryTruckIcon, label: 'Pan-India Delivery' },
] as const;

const HELP_LINKS = [
  { label: 'Shipping Policy', to: '/shipping-policy' },
  { label: 'Return & Refund Policy', to: '/refund-policy' },
  { label: 'Buyback & Exchange', to: '/why-box-diamonds#exchange-buyback' },
  { label: 'Contact Us', to: '/contact' },
] as const;

function ChevronIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M9 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function HomeAboutHelp() {
  return (
    <section className={styles.wrap} aria-labelledby="home-about-heading">
      <div className={styles.about}>
        <div className={styles.aboutText}>
          <h2 id="home-about-heading" className={styles.aboutHeading}>
            About BOX DIAMONDS
          </h2>
          <p className={styles.aboutBody}>
            BOX DIAMONDS is an online jewellery destination offering natural diamond and gold jewellery crafted for
            every occasion. From timeless classics to modern designs, our collections are made to bring a little more
            brilliance to your everyday moments.
          </p>
          <Link to="/our-story" className={styles.aboutLink}>
            Learn More About Us <span aria-hidden="true">→</span>
          </Link>
        </div>
        <ul className={styles.highlights} aria-label="Why shop with BOX DIAMONDS">
          {ABOUT_HIGHLIGHTS.map(({ Icon, label }) => (
            <li key={label} className={styles.highlight}>
              <span className={styles.highlightIcon}>
                <Icon />
              </span>
              <span className={styles.highlightLabel}>{label}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className={styles.help}>
        <div className={styles.helpText}>
          <h2 className={styles.helpHeading}>Need Help?</h2>
          <p className={styles.helpBody}>Find answers about diamonds, gold purity, shipping, returns and more.</p>
          <Link to="/faqs" className={styles.helpButton}>
            Visit Our FAQ Page <span aria-hidden="true">→</span>
          </Link>
        </div>
        <ul className={styles.helpLinks}>
          {HELP_LINKS.map((link) => (
            <li key={link.to}>
              <Link to={link.to} className={styles.helpLink}>
                <span>{link.label}</span>
                <ChevronIcon />
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
