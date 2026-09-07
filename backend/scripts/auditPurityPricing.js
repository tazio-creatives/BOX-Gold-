// Read-only audit: for every purity-bearing variant of a product (status
// filterable), compares the making charge / making charge discount /
// diamond discount resolved WITHOUT any product_purity_pricing_rules row
// (pure product-level defaults — "current", i.e. today's live behaviour)
// against WITH whatever purity-pricing rules actually exist in the target
// database ("new" — computeVariantPricing's real, already-live resolution),
// and the resulting selling price under each. Right after this feature
// ships and before any admin has configured a single rule, "current" and
// "new" must be identical for every row — this script is what proves that,
// and becomes useful again the moment any rule is added, to preview its
// catalogue-wide impact before anyone treats it as final. Modifies nothing
// — SELECTs only.
//
// Usage: node backend/scripts/auditPurityPricing.js > audit-purity-pricing.csv
//        node backend/scripts/auditPurityPricing.js --status=PUBLISHED,DRAFT > audit.csv

import { query, pool } from '../src/config/db.js';
import { findProductById } from '../src/repositories/products.repository.js';
import { findVariantsByProductId, resolvedPurity } from '../src/repositories/productVariants.repository.js';
import { findWeightRuleValuesByProduct } from '../src/repositories/weightRules.repository.js';
import { findPurityPricingRuleValuesByProduct } from '../src/repositories/purityPricingRules.repository.js';
import { computeVariantPricing, resolvePurityPricingFields } from '../src/services/pricingService.js';

const statusArg = process.argv.find((a) => a.startsWith('--status='));
const statuses = statusArg ? statusArg.split('=')[1].split(',') : ['PUBLISHED'];

function csvCell(value) {
  if (value == null) return '';
  const s = String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function csvRow(cells) {
  return cells.map(csvCell).join(',');
}

async function main() {
  const { rows: products } = await query('SELECT id, name FROM products WHERE status = ANY($1) ORDER BY name', [
    statuses,
  ]);

  console.log(
    csvRow([
      'productId',
      'productName',
      'variantId',
      'sku',
      'purity',
      'defaultMakingChargePercent',
      'defaultMakingChargeDiscountPercent',
      'defaultDiamondDiscountPercent',
      'ruleMakingChargePercent',
      'ruleMakingChargeDiscountPercent',
      'ruleDiamondDiscountPercent',
      'effectiveMakingChargePercent',
      'effectiveMakingChargeDiscountPercent',
      'effectiveDiamondDiscountPercent',
      'currentSellingPrice',
      'newSellingPrice',
      'priceDifference',
      'priceWillChange',
      'isPriceOverridden',
      'isPriceLocked',
    ]),
  );

  let scanned = 0;
  let changedCount = 0;

  for (const productRow of products) {
    const product = await findProductById(productRow.id);
    if (!product) continue;

    const variants = await findVariantsByProductId(product.id);
    const weightRules = await findWeightRuleValuesByProduct(product.id);
    const purityPricingRules = await findPurityPricingRuleValuesByProduct(product.id);

    for (const variant of variants) {
      const purityValueId = variant?.attributes?.purity?.valueId ?? null;
      if (purityValueId == null) continue; // this audit only applies to purity-varying combinations

      scanned += 1;
      const realVariant = variant.combination_key === '' ? null : variant;

      // "current" = today's live behaviour, i.e. as if no purity-pricing
      // rule existed at all (pure product-level defaults) — computed by
      // passing an empty rules array.
      const currentPricing = await computeVariantPricing(product, realVariant, weightRules, []);
      // "new" = the real, already-live resolution against whatever rules
      // actually exist for this product right now.
      const newPricing = await computeVariantPricing(product, realVariant, weightRules, purityPricingRules);

      const rule = purityPricingRules.find((r) => r.purity_value_id === purityValueId) ?? null;
      const effective = resolvePurityPricingFields(product, rule);

      const isPriceOverridden = variant.price_override != null;
      const priceDifference = isPriceOverridden
        ? 0
        : Math.round((newPricing.sellingPrice - currentPricing.sellingPrice) * 100) / 100;
      const priceWillChange = !isPriceOverridden && Math.abs(priceDifference) > 0.01;
      if (priceWillChange) changedCount += 1;

      console.log(
        csvRow([
          product.id,
          product.name,
          variant.id,
          variant.sku ?? '',
          resolvedPurity(variant) || product.purity || '',
          product.making_charge_percent,
          product.making_charge_discount_percent,
          product.diamond_discount_percent,
          rule ? rule.making_charge_percent : '',
          rule ? rule.making_charge_discount_percent : '',
          rule ? rule.diamond_discount_percent : '',
          effective.makingChargePercent,
          effective.makingChargeDiscountPercent,
          effective.diamondDiscountPercent,
          currentPricing.sellingPrice,
          newPricing.sellingPrice,
          priceDifference,
          priceWillChange,
          isPriceOverridden,
          product.is_price_locked,
        ]),
      );
    }
  }

  console.error(`Scanned ${scanned} purity-bearing variant row(s) across ${products.length} product(s) (status: ${statuses.join(', ')}).`);
  console.error(`${changedCount} variant row(s) would see a different selling price from configured purity-pricing rules.`);
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
