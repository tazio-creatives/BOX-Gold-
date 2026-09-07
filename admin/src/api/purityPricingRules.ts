import { apiFetch } from './client';
import type { Purity } from './types';

export interface PurityPricingRule {
  purityValueId: string;
  purity: Purity;
  purityLabel: string;
  // Saved overrides — null means "inherits the product default", distinct
  // from an explicit 0.
  makingChargePercent: number | null;
  makingChargeDiscountPercent: number | null;
  diamondDiscountPercent: number | null;
  // Already-resolved (rule ?? product default) values, for display only —
  // never sent back on save.
  effectiveMakingChargePercent: number | null;
  effectiveMakingChargeDiscountPercent: number;
  effectiveDiamondDiscountPercent: number;
}

export interface ReplacePurityPricingRulesInput {
  purityPricingRules: {
    purityValueId: string;
    makingChargePercent: number | null;
    makingChargeDiscountPercent: number | null;
    diamondDiscountPercent: number | null;
  }[];
}

export function fetchPurityPricingRules(productId: string) {
  return apiFetch<{ rules: PurityPricingRule[] }>(`/admin/products/${productId}/purity-pricing-rules`);
}

export function replacePurityPricingRules(productId: string, input: ReplacePurityPricingRulesInput) {
  return apiFetch<{ rules: PurityPricingRule[] }>(`/admin/products/${productId}/purity-pricing-rules`, {
    method: 'PUT',
    body: JSON.stringify(input),
  });
}
