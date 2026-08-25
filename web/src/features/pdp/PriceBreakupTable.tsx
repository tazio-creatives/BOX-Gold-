import type { MetalType, PriceBreakup } from '../../api/types';
import { formatPrice } from '../../utils/formatPrice';
import styles from './PriceBreakupTable.module.css';

function ValueCell({ original, discounted }: { original: number; discounted: number }) {
  if (discounted >= original) return <td>{formatPrice(discounted)}</td>;
  return (
    <td>
      <span className={styles.original}>{formatPrice(original)}</span> {formatPrice(discounted)}
    </td>
  );
}

export function PriceBreakupTable({
  breakup,
  metalType,
}: {
  breakup: PriceBreakup;
  metalType: MetalType;
}) {
  const hasOffer = breakup.makingChargeDiscountPercent > 0 || breakup.diamondDiscountPercent > 0;

  return (
    <table className={styles.table}>
      <tbody>
        <tr>
          <td>{metalType === 'GOLD' ? 'Gold Value' : 'Platinum Value'}</td>
          <td>{formatPrice(breakup.goldValue)}</td>
        </tr>
        {breakup.diamondValueOriginal > 0 && (
          <tr>
            <td>
              Diamond Value
              {breakup.diamondDiscountPercent > 0 && (
                <span className={styles.offerBadge}>{breakup.diamondDiscountPercent}% off</span>
              )}
            </td>
            <ValueCell original={breakup.diamondValueOriginal} discounted={breakup.diamondValue} />
          </tr>
        )}
        <tr>
          <td>
            Making Charge
            {breakup.makingChargeDiscountPercent > 0 && (
              <span className={styles.offerBadge}>{breakup.makingChargeDiscountPercent}% off</span>
            )}
          </td>
          <ValueCell original={breakup.makingChargeOriginal} discounted={breakup.makingCharge} />
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
      {hasOffer && (
        <tfoot>
          <tr>
            <td colSpan={2} className={styles.offerNote}>
              Special offer applied
            </td>
          </tr>
        </tfoot>
      )}
    </table>
  );
}
