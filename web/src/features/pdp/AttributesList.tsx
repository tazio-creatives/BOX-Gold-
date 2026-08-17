import type { ProductDetail } from '../../api/types';
import styles from './AttributesList.module.css';

export function AttributesList({ product }: { product: ProductDetail }) {
  const rows: [string, string][] = [['SKU', product.sku]];

  const metalLabel = product.metalType === 'GOLD' ? 'Gold' : 'Platinum';
  const goldColorLabel = product.goldColor
    ? product.goldColor.charAt(0) + product.goldColor.slice(1).toLowerCase()
    : '';
  rows.push(['Metal', [product.purity, goldColorLabel, metalLabel].filter(Boolean).join(' ')]);
  if (product.purity) rows.push(['Purity', product.purity]);

  if (product.grossWeightGrams != null) rows.push(['Gross Weight', `${product.grossWeightGrams} g`]);
  if (product.netWeightGrams != null) rows.push(['Net Weight', `${product.netWeightGrams} g`]);
  if (product.diamondWeightCarats) rows.push(['Diamond Weight', `${product.diamondWeightCarats} ct`]);
  if (product.diamondCount) rows.push(['Diamond Count', String(product.diamondCount)]);
  if (product.diamondType) rows.push(['Diamond Type', product.diamondType]);
  if (product.diamondColour) rows.push(['Diamond Colour', product.diamondColour]);
  if (product.diamondClarity) rows.push(['Diamond Clarity', product.diamondClarity]);
  if (product.gemstone) rows.push(['Gemstone', product.gemstone]);
  if (product.certification) rows.push(['Certification', product.certification]);
  if (product.productSize) rows.push(['Size', product.productSize]);

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
