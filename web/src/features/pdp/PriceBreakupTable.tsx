import type { MetalType, PriceBreakup } from '../../api/types';
import { formatPrice } from '../../utils/formatPrice';
import styles from './PriceBreakupTable.module.css';

export function PriceBreakupTable({
  breakup,
  metalType,
}: {
  breakup: PriceBreakup;
  metalType: MetalType;
}) {
  return (
    <table className={styles.table}>
      <tbody>
        <tr>
          <td>{metalType === 'GOLD' ? 'Gold Value' : 'Platinum Value'}</td>
          <td>{formatPrice(breakup.goldValue)}</td>
        </tr>
        {breakup.diamondValue > 0 && (
          <tr>
            <td>Diamond Value</td>
            <td>{formatPrice(breakup.diamondValue)}</td>
          </tr>
        )}
        <tr>
          <td>Making Charge</td>
          <td>{formatPrice(breakup.makingCharge)}</td>
        </tr>
        <tr>
          <td>GST</td>
          <td>{formatPrice(breakup.gstAmount)}</td>
        </tr>
        <tr className={styles.totalRow}>
          <td>
            Total <span className={styles.totalNote}>(Inclusive of all taxes)</span>
          </td>
          <td>{formatPrice(breakup.total)}</td>
        </tr>
      </tbody>
    </table>
  );
}
