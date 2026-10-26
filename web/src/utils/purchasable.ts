// Shown wherever a product can't be bought because its price is missing or
// invalid (final price not above ₹0). The server refuses such a line at
// add-to-cart and checkout regardless; this is only the customer-facing copy.
export const UNPURCHASABLE_MESSAGE = 'This product is temporarily unavailable for purchase. Please contact support.';

export function isPurchasablePrice(price: number | null | undefined): boolean {
  return Number(price) > 0;
}
