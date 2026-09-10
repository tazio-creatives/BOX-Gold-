import {
  DiamondIcon,
  HallmarkIcon,
  BuybackIcon,
  ExchangeIcon,
  ShieldCheckIcon,
} from '../../components/assuranceIcons';
import styles from './AssuranceStrip.module.css';

const ASSURANCES = [
  { Icon: DiamondIcon, title: '100% Certified Diamonds', description: '100% Genuine' },
  { Icon: HallmarkIcon, title: 'BIS Hallmark Gold', description: 'Trust You Can Wear' },
  { Icon: BuybackIcon, title: 'Buyback Guarantee', description: 'Best Value, Always' },
  { Icon: ExchangeIcon, title: 'Exchange Support', description: 'Easy & Hassle Free' },
  { Icon: ShieldCheckIcon, title: 'Secure Payment', description: 'Safe & Reliable' },
] as const;

// Static, non-CMS content (plan: "Do not add an admin configuration
// screen") — placed directly below the HERO section by HomePage.tsx, not
// part of the data-driven HomepageSection switch, since it isn't a
// homepage_sections row and has no per-instance content to vary.
export function AssuranceStrip() {
  return (
    <section className={styles.strip} aria-label="Shopping assurances">
      {ASSURANCES.map(({ Icon, title, description }) => (
        <div className={styles.item} key={title}>
          <Icon />
          <div className={styles.text}>
            <p className={styles.title}>{title}</p>
            <p className={styles.description}>{description}</p>
          </div>
        </div>
      ))}
    </section>
  );
}
