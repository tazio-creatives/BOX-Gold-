// Manufacturing constraint, not a pricing one (gold color never affects
// price — see pricingService.js's computeVariantPricing) — 9K's lower gold
// content isn't offered in the Rose Gold alloy. Universal across every
// product, not admin-configurable per product; mirrored in
// web/src/utils/goldColorRules.ts for the PDP's disabled-swatch UI.
const UNAVAILABLE_COLORS_BY_PURITY = {
  '9K': ['ROSE'],
};

export function isColorAvailableAtPurity(color, purity) {
  if (!purity) return true;
  const blocked = UNAVAILABLE_COLORS_BY_PURITY[purity];
  return !blocked?.includes(color);
}
