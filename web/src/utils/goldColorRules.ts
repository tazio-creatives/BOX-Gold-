import type { GoldColor, Purity } from '../api/types';

// Manufacturing constraint, not a pricing one (gold color never affects
// price — see pricingService.js) — 9K's lower gold content isn't offered in
// the Rose Gold alloy. Universal across every product, not admin-configurable
// per product; mirrored in backend/src/utils/goldColorRules.js for the
// server-side add-to-cart gate.
const UNAVAILABLE_COLORS_BY_PURITY: Partial<Record<Purity, GoldColor[]>> = {
  '9K': ['ROSE'],
};

export function isColorAvailableAtPurity(color: GoldColor, purity: string | null | undefined): boolean {
  if (!purity) return true;
  const blocked = UNAVAILABLE_COLORS_BY_PURITY[purity as Purity];
  return !blocked?.includes(color);
}

export function unavailableColorReason(color: GoldColor, purity: string, colorLabel: string): string {
  return `${colorLabel} isn't available in ${purity} purity.`;
}
