import { AppError } from '../utils/AppError.js';

// There is no free-product or giveaway workflow: a product line whose final
// selling price (computeVariantPricing's sellingPrice, after product offers)
// isn't above zero means a pricing input is missing or broken, never
// something to sell. Checked on the line's final price only — zero-valued
// breakup parts (free shipping, a 0% discount, no diamond value) are fine.
export const UNPURCHASABLE_MESSAGE = 'This product is temporarily unavailable for purchase. Please contact support.';

export function isPurchasablePrice(sellingPrice) {
  return Number(sellingPrice) > 0;
}

export function assertPurchasablePrice(sellingPrice, productName = null) {
  if (isPurchasablePrice(sellingPrice)) return;
  throw new AppError(
    409,
    productName ? `${productName} is temporarily unavailable for purchase. Please contact support.` : UNPURCHASABLE_MESSAGE,
  );
}
