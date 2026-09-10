import {
  DiamondIcon,
  HallmarkIcon,
  BuybackIcon,
  ExchangeIcon,
  ShieldCheckIcon,
} from './assuranceIcons';
import styles from './ProductAssuranceGrid.module.css';

interface ProductAssuranceGridProps {
  // Static per-product facts, not the live customer selection — a product's
  // metal type and whether it carries diamonds at all don't change based on
  // which purity/colour/diamond-quality option is picked, so these are
  // decided once from the product record, not from ProductInfo's selection
  // state (plan: "Do not display claims that are untrue for the selected
  // product or variation").
  hasDiamonds: boolean;
  isGold: boolean;
}

// Separate, deliberately lighter design from the homepage's dark
// AssuranceStrip (pages/home/AssuranceStrip.tsx) — same icon set, its own
// compact ivory/champagne layout. Renders only the claims that are actually
// true for this product; Buyback/Exchange/Secure Payment are universal.
export function ProductAssuranceGrid({ hasDiamonds, isGold }: ProductAssuranceGridProps) {
  const items = [
    hasDiamonds && {
      key: 'diamonds',
      Icon: DiamondIcon,
      title: '100% Certified Diamonds',
      description: 'Genuine and quality checked',
    },
    isGold && {
      key: 'hallmark',
      Icon: HallmarkIcon,
      title: 'BIS Hallmark Gold',
      description: 'Purity you can trust',
    },
    {
      key: 'buyback',
      Icon: BuybackIcon,
      title: 'Buyback Guarantee',
      description: 'Best value, always',
    },
    {
      key: 'exchange',
      Icon: ExchangeIcon,
      title: 'Easy Exchange',
      description: 'Simple and hassle-free',
    },
    {
      key: 'payment',
      Icon: ShieldCheckIcon,
      title: 'Secure Payment',
      description: 'Safe and reliable checkout',
    },
  ].filter((item): item is Exclude<typeof item, false> => item !== false);

  // An odd count would otherwise leave one item awkwardly alone in the last
  // row's first column — span it across both instead (matches the 5-item
  // reference design's "final item spans both columns", generalized to
  // whatever count survives the conditional filtering above).
  const lastIndex = items.length - 1;

  return (
    <section className={styles.grid} aria-label="Product assurances">
      {items.map(({ key, Icon, title, description }, i) => (
        <div key={key} className={`${styles.item} ${i === lastIndex && items.length % 2 === 1 ? styles.spanFull : ''}`}>
          <span className={styles.iconWrap}>
            <Icon />
          </span>
          <div className={styles.text}>
            <p className={styles.title}>{title}</p>
            <p className={styles.description}>{description}</p>
          </div>
        </div>
      ))}
    </section>
  );
}
