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

  if (product.goldWeightGrams != null) rows.push(['Gold Weight', `${product.goldWeightGrams} g`]);
  if (product.netWeightGrams != null) rows.push(['Net Weight', `${product.netWeightGrams} g`]);
  if (product.diamondWeightGrams != null) rows.push(['Diamond Weight', `${product.diamondWeightGrams} g`]);
  if (product.grossWeightGrams != null) rows.push(['Gross Weight', `${product.grossWeightGrams} g`]);
  if (product.diamondWeightCarats) rows.push(['Diamond Carat', `${product.diamondWeightCarats} ct`]);
  if (product.diamondConfigName) rows.push(['Diamond Quality', product.diamondConfigName]);
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
