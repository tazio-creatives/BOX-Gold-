import type { ProductDetail } from '../../api/types';
import styles from './AttributesList.module.css';

// Weight columns are NUMERIC(10,3) in the DB — admin enters up to 3 decimal
// places (e.g. 0.580), but a plain template-literal interpolation silently
// drops trailing zeros (JS's Number(0.580) === 0.58), so a weight the admin
// entered with 3 decimals could render with only 1 or 2. Always show all 3.
function formatWeight(grams: number): string {
  return grams.toFixed(3);
}

interface AttributesListProps {
  product: ProductDetail;
  // Live-selection overrides — a variant picked via Purity/Gold Colour/
  // Diamond Quality can genuinely differ from the product's own base
  // configuration (a different weight at a different purity, say), so this
  // panel must reflect what's actually selected/priced, not always the
  // product's admin-set defaults. Each is optional and falls back to the
  // matching static `product` field when not provided (e.g. the axis isn't
  // configured at all, or nothing's been selected yet).
  livePurity?: string | null;
  liveGoldColor?: string | null;
  liveDiamondConfigName?: string | null;
  liveGoldWeightGrams?: number | null;
  liveNetWeightGrams?: number | null;
  liveGrossWeightGrams?: number | null;
  liveDiamondWeightCarats?: number | null;
}

export function AttributesList({
  product,
  livePurity,
  liveGoldColor,
  liveDiamondConfigName,
  liveGoldWeightGrams,
  liveNetWeightGrams,
  liveGrossWeightGrams,
  liveDiamondWeightCarats,
}: AttributesListProps) {
  const rows: [string, string][] = [['SKU', product.sku]];

  const purity = livePurity ?? product.purity;
  const goldColor = liveGoldColor ?? product.goldColor;
  const goldWeightGrams = liveGoldWeightGrams ?? product.goldWeightGrams;
  const netWeightGrams = liveNetWeightGrams ?? product.netWeightGrams;
  const grossWeightGrams = liveGrossWeightGrams ?? product.grossWeightGrams;
  const diamondWeightCarats = liveDiamondWeightCarats ?? product.diamondWeightCarats;
  const diamondConfigName = liveDiamondConfigName ?? product.diamondConfigName;

  const metalLabel = product.metalType === 'GOLD' ? 'Gold' : 'Platinum';
  const goldColorLabel = goldColor ? goldColor.charAt(0) + goldColor.slice(1).toLowerCase() : '';
  rows.push(['Metal', [purity, goldColorLabel, metalLabel].filter(Boolean).join(' ')]);
  if (purity) rows.push(['Purity', purity]);

  if (goldWeightGrams != null) rows.push(['Gold Weight', `${formatWeight(goldWeightGrams)} g`]);
  if (netWeightGrams != null) rows.push(['Net Weight', `${formatWeight(netWeightGrams)} g`]);
  if (product.diamondWeightGrams != null) rows.push(['Diamond Weight', `${formatWeight(product.diamondWeightGrams)} g`]);
  if (grossWeightGrams != null) rows.push(['Gross Weight', `${formatWeight(grossWeightGrams)} g`]);
  if (diamondWeightCarats) rows.push(['Diamond Carat', `${formatWeight(diamondWeightCarats)} ct`]);
  if (diamondConfigName) rows.push(['Diamond Quality', diamondConfigName]);
  if (product.diamondCount) rows.push(['Diamond Count', String(product.diamondCount)]);
  if (product.gemstone) rows.push(['Gemstone', product.gemstone]);

  return (
    <dl className={styles.list}>
      {rows.map(([label, value]) => (
        <div key={label} className={styles.row}>
          <dt className={styles.term}>{label}</dt>
          <dd className={styles.value}>{value}</dd>
        </div>
      ))}
    </dl>
  );
}
