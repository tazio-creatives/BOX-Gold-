import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import styles from './Footer.module.css';

const COLUMNS: { title: string; links: { label: string; to: string }[] }[] = [
  {
    title: 'Shop',
    links: [
      { label: 'Rings', to: '/rings' },
      { label: 'Earrings', to: '/earrings' },
      { label: 'Necklaces', to: '/necklaces' },
      { label: 'Bangles', to: '/bangles' },
      { label: 'Bracelets', to: '/bracelets' },
      { label: 'Pendants', to: '/pendants' },
      { label: 'Gifts', to: '/gifts' },
    ],
  },
  {
    title: 'Customer Care',
    links: [
      { label: 'Contact Us', to: '/contact' },
      { label: 'FAQs', to: '/faqs' },
      { label: 'Shipping & Delivery', to: '/shipping-policy' },
      { label: 'Returns & Exchange', to: '/refund-policy' },
      { label: 'Track Order', to: '/account/orders' },
      { label: 'Size Guide', to: '/size-guide' },
      { label: 'Care Guide', to: '/care-guide' },
    ],
  },
  {
    title: 'About Us',
    links: [
      { label: 'Our Story', to: '/our-story' },
      { label: 'Why Box Diamonds', to: '/why-box-diamonds' },
      { label: 'Blog', to: '/blog' },
      { label: 'Careers', to: '/careers' },
      { label: 'Press', to: '/press' },
      { label: 'Sustainability', to: '/sustainability' },
    ],
  },
  {
    title: 'Policies',
    links: [
      { label: 'Privacy Policy', to: '/privacy-policy' },
      { label: 'Terms & Conditions', to: '/terms' },
      { label: 'Refund Policy', to: '/refund-policy' },
      { label: 'Shipping Policy', to: '/shipping-policy' },
      { label: 'Cancellation Policy', to: '/cancellation-policy' },
    ],
  },
];

export function Footer() {
  return (
    <footer className={styles.footer}>
      <div className={styles.top}>
        <div className={styles.brandCol}>
          <img src="/logo.png" alt="Box Diamonds" className={styles.logo} />
          <p className={styles.tagline}>Because every precious moment deserves a perfect sparkle.</p>
          <div className={styles.social}>
            <SocialIcon label="Instagram">
              <rect x="3" y="3" width="18" height="18" rx="5" />
              <circle cx="12" cy="12" r="4" />
              <circle cx="17.2" cy="6.8" r="1" fill="currentColor" stroke="none" />
            </SocialIcon>
            <SocialIcon label="Facebook">
              <path d="M14 9h3V6h-3c-2.2 0-4 1.8-4 4v2H8v3h2v6h3v-6h3l1-3h-4v-2c0-.6.4-1 1-1z" />
            </SocialIcon>
            <SocialIcon label="Pinterest">
              <circle cx="12" cy="12" r="9" />
              <path d="M9.5 17c1-3 1.5-5 1.5-6.5a2 2 0 1 1 4 .3c0 1.2-.8 3.2-1.2 4.2-.4 1 .2 1.8 1.2 1.8 1.5 0 2.6-1.9 2.6-4.4 0-2.3-1.7-4-4.3-4-3 0-4.7 2.1-4.7 4.4 0 .8.3 1.6.6 2" />
            </SocialIcon>
            <SocialIcon label="YouTube">
              <rect x="3" y="6" width="18" height="12" rx="3" />
              <path d="M11 10l4 2-4 2v-4z" fill="currentColor" stroke="none" />
            </SocialIcon>
          </div>
        </div>

        {COLUMNS.map((col) => (
          <div key={col.title} className={styles.col}>
            <p className={styles.colTitle}>{col.title}</p>
            <ul className={styles.linkList}>
              {col.links.map((link) => (
                <li key={link.label}>
                  <Link to={link.to} className={styles.link}>
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className={styles.bottom}>
        <p className={styles.copy}>© {new Date().getFullYear()} Box Diamonds. All rights reserved.</p>
        <p className={styles.secure}>100% Secure Payments</p>
      </div>
    </footer>
  );
}

function SocialIcon({ label, children }: { label: string; children: ReactNode }) {
  return (
    <a href="#" className={styles.socialIcon} aria-label={label} onClick={(e) => e.preventDefault()}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        {children}
      </svg>
    </a>
  );
}
