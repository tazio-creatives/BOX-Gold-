import { withTransaction } from '../config/db.js';
import { slugify } from '../utils/slug.js';
import { NotFoundError, AppError } from '../utils/AppError.js';
import {
  listProducts as listProductsRow,
  findProductBySlug,
  findProductById,
  findProductImages,
  createProduct as createProductRow,
  updateProduct as updateProductRow,
  deleteProduct as deleteProductRow,
} from '../repositories/products.repository.js';
import {
  findVariantsByProductId,
  findAvailableVariantsByProductId,
  findVariantById,
  findProductAttributeCatalogue,
  updateVariantFields,
  bulkUpdateVariantFields,
} from '../repositories/productVariants.repository.js';
import {
  syncProductVariants,
  applyExclusionRules,
  applySizeStockUpdates,
  pruneOrphanedPurityRules,
} from './variantSyncService.js';
import {
  findExclusionRulesByProduct,
  createExclusionRule,
  deleteExclusionRule,
} from '../repositories/exclusionRules.repository.js';
import {
  findWeightRulesByProduct,
  findWeightRuleValuesByProduct,
  replaceWeightRules,
} from '../repositories/weightRules.repository.js';
import {
  findPurityPricingRulesByProduct,
  findPurityPricingRuleValuesByProduct,
  replacePurityPricingRules,
} from '../repositories/purityPricingRules.repository.js';
import {
  findCategoryBySlug,
  getCategoryAndDescendantIds,
} from '../repositories/categories.repository.js';
import { findCollectionBySlug } from '../repositories/collections.repository.js';
import { findDiamondConfigById } from '../repositories/diamondConfigs.repository.js';
import { computeVariantPricing, resolvePurityPricingFields } from './pricingService.js';
import { invalidateProductPages } from './pageCacheInvalidation.js';

// Weight-rule and variant edits must invalidate the SSR page cache after
// their transaction commits — never before, so a concurrent request can
// never observe a cache miss followed by a re-render of pre-commit data.
// Invalidation failing here must not roll back or fail an otherwise
// successful save (the write already committed); it's logged instead, same
// pattern as paymentService.js's invalidateOrderProductPages, so a stale
// cache row is at least visible in logs rather than silently persisting for
// the rest of its TTL.
async function safeInvalidateProductPages(product, operationName, previousCategoryId) {
  try {
    await invalidateProductPages(product, previousCategoryId);
  } catch (err) {
    console.error(`Page cache invalidation after ${operationName} failed (product ${product.id}):`, err);
  }
}

// Both net_weight_grams and gross_weight_grams are derived, not
// admin-entered directly. Net weight is the precious-metal-only weight
// (what pricingService.computeGoldValue actually prices against); gross
// weight is the total finished-piece weight (gold + diamond) shown to
// customers alongside it.
function deriveNetWeightGrams(goldWeightGrams) {
  return goldWeightGrams ?? null;
}

function deriveGrossWeightGrams(goldWeightGrams, diamondWeightGrams) {
  if (goldWeightGrams == null && diamondWeightGrams == null) return null;
  return Math.round(((goldWeightGrams ?? 0) + (diamondWeightGrams ?? 0)) * 1000) / 1000;
}

// Builds a synthetic, non-persisted "variant" representing the product's own
// base configuration (its own Purity — not any real product_variants row),
// purely so computeVariantPricing takes its live-recompute path (every
// branch there keys off `variant != null`) instead of trusting the
// (possibly stale, e.g. after a gold-rate sync) cached gold_value/
// diamond_value columns. Carries no weight/diamond overrides of its own, so
// weight resolution still falls through the normal rule-then-base-weight
// chain, and no price_override, so a manual override never leaks in here.
async function buildBaseConfigVariant(product) {
  const attributes = {};
  if (product.purity) {
    const catalogue = await findProductAttributeCatalogue(product.id);
    const purityValue = catalogue.find((a) => a.code === 'purity')?.values.find((v) => v.value === product.purity);
    if (purityValue) {
      attributes.purity = { valueId: purityValue.id, value: purityValue.value, label: purityValue.label, refId: null };
    }
  }
  return {
    gold_weight_grams: null,
    diamond_weight_carats: null,
    price_override: null,
    combination_key: 'base-config',
    attributes,
  };
}

// A product's listing/base price — and the PDP's price before the shopper
// touches anything — reflects the product's own base configuration (the
// Metal/Diamond/Pricing section on the admin form: its own Purity, Gold
// Weight, Diamond Weight, Making Charge %), not whichever variant happens to
// be cheapest. Deliberately does NOT scan product_variants at all — every
// real variant is still priced live at read time by computeVariantPricing
// itself (PDP price-preview, cart, checkout, admin variant list), this only
// refreshes the cached base numbers used by listing/card views and a PDP's
// price before anything is selected.
// Null-safe percent comparison — null and 0 are different states (no cached
// value yet vs. a resolved 0%), so this must not treat them as equal.
function percentDiffers(a, b) {
  if (a == null || b == null) return a !== b;
  return Math.abs(a - b) > 1e-9;
}

export async function applyBaseProductPricing(productId, isPriceLocked) {
  if (isPriceLocked) return;
  const product = await findProductById(productId);
  if (!product) return;

  const weightRules = await findWeightRuleValuesByProduct(productId);
  const purityPricingRules = await findPurityPricingRuleValuesByProduct(productId);
  const baseVariant = await buildBaseConfigVariant(product);
  const pricing = await computeVariantPricing(product, baseVariant, weightRules, purityPricingRules);

  // effective_making_charge_discount_percent / effective_diamond_discount_percent
  // are what list-view cards (rowOffer/toListDto) actually read for the offer
  // badge/discounted price — resolved through the same Purity Pricing Rule as
  // the PDP, so a purity-specific discount shows up in listings too, not just
  // on the detail page. Deliberately separate columns from
  // making_charge_discount_percent/diamond_discount_percent (the admin's own
  // typed default) so editing a purity rule never silently overwrites that
  // default field.
  const currentEffectiveMakingDiscount =
    product.effective_making_charge_discount_percent == null ? null : Number(product.effective_making_charge_discount_percent);
  const currentEffectiveDiamondDiscount =
    product.effective_diamond_discount_percent == null ? null : Number(product.effective_diamond_discount_percent);

  // Every field compared here is a field the write below actually sets —
  // comparing only the aggregate sellingPriceOriginal let a prior bug through:
  // a caller (e.g. the admin form) can write goldValue/makingCharge/
  // sellingPrice directly in one PATCH, in a combination where the total
  // happens to already match this recompute even though a component (like
  // makingCharge) doesn't — that combination must still be corrected, not
  // skipped, or the stored breakdown stays internally inconsistent forever
  // (list/detail priceBreakup shows the wrong makingCharge while the total
  // "coincidentally" looks right).
  const unchanged =
    Math.abs(pricing.goldValue - Number(product.gold_value)) < 1e-9 &&
    Math.abs(pricing.diamondValueOriginal - Number(product.diamond_value)) < 1e-9 &&
    Math.abs(pricing.makingChargeOriginal - Number(product.making_charge)) < 1e-9 &&
    Math.abs(pricing.sellingPriceOriginal - Number(product.selling_price)) < 1e-9 &&
    !percentDiffers(pricing.makingChargeDiscountPercent, currentEffectiveMakingDiscount) &&
    !percentDiffers(pricing.diamondDiscountPercent, currentEffectiveDiamondDiscount);
  if (unchanged) return;

  await updateProductRow(productId, {
    goldValue: pricing.goldValue,
    diamondValue: pricing.diamondValueOriginal,
    makingCharge: pricing.makingChargeOriginal,
    sellingPrice: pricing.sellingPriceOriginal,
    effectiveMakingChargeDiscountPercent: pricing.makingChargeDiscountPercent,
    effectiveDiamondDiscountPercent: pricing.diamondDiscountPercent,
  });
}

// Resolves purity/size *codes* ("9K", "6") to this product's actual
// attribute_value UUIDs — shared by the standalone Weight Defaults / Purity
// Pricing Rules endpoints (adminReplaceWeightRules/
// adminReplacePurityPricingRules below) and the combined product
// create/update save (applyWeightAndPricingRulesInTx), so both reject an
// unconfigured purity/size identically. Must be called after
// syncProductVariants has run for this request — that's what creates a
// brand-new size's product-scoped attribute_value row; a purity's global row
// always exists already (seeded once, product-independent).
async function buildPurityAndSizeResolver(productId) {
  const catalogue = await findProductAttributeCatalogue(productId);
  const purityByValue = new Map(
    (catalogue.find((a) => a.code === 'purity')?.values ?? []).map((v) => [v.value, v.id]),
  );
  const sizeByLabel = new Map((catalogue.find((a) => a.code === 'size')?.values ?? []).map((v) => [v.value, v.id]));
  function resolve(purity, sizeLabel) {
    const purityValueId = purityByValue.get(purity);
    if (!purityValueId) throw new AppError(409, `Purity ${purity} is not offered by this product`);
    if (sizeLabel == null) return { purityValueId, sizeValueId: null };
    const sizeValueId = sizeByLabel.get(sizeLabel);
    if (!sizeValueId) throw new AppError(409, `Size ${sizeLabel} is not offered by this product`);
    return { purityValueId, sizeValueId };
  }
  return { purityByValue, sizeByLabel, resolve };
}

// Resolves and persists weightRules/purityPricingRules as part of the
// combined product create/update save — called from inside the SAME
// withTransaction as the product row insert/update and syncProductVariants,
// so a failure here rolls back the entire save, not just these two tables.
// replaceWeightRules/replacePurityPricingRules are the plain repository
// functions (not adminReplaceWeightRules/adminReplacePurityPricingRules
// below, which each open their OWN withTransaction — calling one of those
// from inside this transaction would connect a second pool client and
// commit independently, breaking atomicity). Both repository functions use
// the ambient query() from config/db.js, so they transparently join
// whichever transaction is active via AsyncLocalStorage.
//
// PATCH semantics: `weightRules`/`purityPricingRules` being `undefined`
// (the key was absent from the request) leaves the saved rows completely
// untouched — this function returns immediately for that half of the call.
// An explicitly-sent empty collection (`{purityRules: [], puritySizeRules:
// []}` or `[]`) intentionally clears it — replaceWeightRules/
// replacePurityPricingRules already treat "no rows" as "delete everything,
// insert nothing" (see their own DELETE-then-INSERT bodies).
async function applyWeightAndPricingRulesInTx(productId, { weightRules, purityPricingRules }) {
  if (weightRules === undefined && purityPricingRules === undefined) return;
  const { resolve } = await buildPurityAndSizeResolver(productId);

  if (weightRules !== undefined) {
    const resolved = new Map();
    for (const r of weightRules.purityRules) {
      const { purityValueId, sizeValueId } = resolve(r.purity, null);
      resolved.set(`${purityValueId}|`, { purityValueId, sizeValueId, goldWeightGrams: r.goldWeightGrams });
    }
    for (const r of weightRules.puritySizeRules) {
      const { purityValueId, sizeValueId } = resolve(r.purity, r.sizeLabel);
      resolved.set(`${purityValueId}|${sizeValueId}`, { purityValueId, sizeValueId, goldWeightGrams: r.goldWeightGrams });
    }
    await replaceWeightRules(productId, [...resolved.values()]);
  }

  if (purityPricingRules !== undefined) {
    const resolved = purityPricingRules.map((r) => {
      const { purityValueId } = resolve(r.purity, null);
      return {
        purityValueId,
        makingChargePercent: r.makingChargePercent ?? null,
        makingChargeDiscountPercent: r.makingChargeDiscountPercent ?? null,
        diamondDiscountPercent: r.diamondDiscountPercent ?? null,
      };
    });
    await replacePurityPricingRules(productId, resolved);
  }
}

export async function resolveCategoryIds(categorySlug) {
  if (!categorySlug) return undefined;
  const category = await findCategoryBySlug(categorySlug);
  if (!category) return []; // unknown slug -> no matches, not an error
  return getCategoryAndDescendantIds(category.id);
}

async function resolveCollectionId(collectionSlug) {
  if (!collectionSlug) return undefined;
  const collection = await findCollectionBySlug(collectionSlug);
  return collection?.id ?? null; // null on unknown slug -> no matches
}

export async function listPublicProducts({
  categorySlug,
  collectionSlug,
  metalType,
  purity,
  goldColor,
  priceMin,
  priceMax,
  sort,
  page,
  limit,
}) {
  const categoryIds = await resolveCategoryIds(categorySlug);
  const collectionId = await resolveCollectionId(collectionSlug);
  if (collectionId === null || (categoryIds && categoryIds.length === 0)) {
    return { items: [], total: 0 };
  }

  return listProductsRow(
    { categoryIds, collectionId, metalType, purity, goldColor, priceMin, priceMax, status: 'PUBLISHED' },
    { sort, page, limit },
  );
}

export async function getPublicProductBySlug(slug) {
  const product = await findProductBySlug(slug);
  if (!product || product.status !== 'PUBLISHED') {
    throw new NotFoundError('Product not found');
  }
  const images = await findProductImages(product.id);
  const attributes = await findProductAttributeCatalogue(product.id);
  const variants = await findAvailableVariantsByProductId(product.id);
  const diamondConfigName = product.diamond_config_id
    ? ((await findDiamondConfigById(product.diamond_config_id))?.name ?? null)
    : null;
  return { ...product, images, attributes, variants, diamondConfigName };
}

export async function getRelatedProducts(slug, limit = 4) {
  const product = await findProductBySlug(slug);
  if (!product || product.status !== 'PUBLISHED') return [];
  const categoryIds = await getCategoryAndDescendantIds(product.category_id);
  const { items } = await listProductsRow(
    { categoryIds, status: 'PUBLISHED', excludeId: product.id },
    { sort: 'newest', page: 1, limit },
  );
  return items;
}

export function adminListProducts(filters, pagination) {
  return listProductsRow(filters, pagination);
}

export async function adminGetProduct(id) {
  const product = await findProductById(id);
  if (!product) throw new NotFoundError('Product not found');
  const images = await findProductImages(id);
  const attributes = await findProductAttributeCatalogue(id);
  const variants = await findVariantsByProductId(id);
  return { ...product, images, attributes, variants };
}

export async function adminCreateProduct(input) {
  const slug = input.slug ? slugify(input.slug) : slugify(input.name);
  const {
    sizes: sizesInput,
    goldColors,
    purities,
    diamondConfigIds,
    variantOverrides,
    weightRules,
    purityPricingRules,
    ...fields
  } = input;
  fields.netWeightGrams = deriveNetWeightGrams(fields.goldWeightGrams);
  fields.grossWeightGrams = deriveGrossWeightGrams(fields.goldWeightGrams, fields.diamondWeightGrams);

  // The row insert, variant-matrix generation, weight/purity-pricing rule
  // application, and cheapest-price cache refresh all succeed or fail
  // together — a mid-sequence failure (e.g. a DB hiccup after variants are
  // created but before pricing is cached) used to leave a half-configured
  // product behind instead of rolling back to nothing. Product create/edit
  // is a single continuous form (Product Create/Edit Architecture Report,
  // 2026-09-07) — Weight Defaults and Purity Pricing Rules are entered and
  // saved in this same transaction, not as separate save actions requiring
  // the admin to reopen the product afterward.
  const product = await withTransaction(async () => {
    const created = await createProductRow({ ...fields, slug, status: input.status ?? 'DRAFT' });
    await syncProductVariants(created.id, {
      goldColors,
      purities,
      diamondConfigIds,
      sizes: sizesInput,
      stockQuantity: fields.stockQuantity ?? created.stock_quantity,
      variantOverrides,
    });
    // Resolved against the purities/sizes syncProductVariants just created —
    // must run after it, never before.
    await applyWeightAndPricingRulesInTx(created.id, { weightRules, purityPricingRules });
    await applyBaseProductPricing(created.id, fields.isPriceLocked ?? created.is_price_locked);
    // available_stock rolls up from variants, and price may have just been
    // reconciled — re-fetch so the response reflects both.
    return findProductById(created.id);
  });

  // Cache invalidation deliberately runs after the transaction commits —
  // invalidating pages for a write that then rolled back would be wrong.
  await invalidateProductPages(product);
  const attributes = await findProductAttributeCatalogue(product.id);
  const variants = await findVariantsByProductId(product.id);
  return { ...product, attributes, variants };
}

export async function adminUpdateProduct(id, input) {
  const existing = await findProductById(id);
  if (!existing) throw new NotFoundError('Product not found');

  const {
    sizes: sizesInput,
    goldColors,
    purities,
    diamondConfigIds,
    variantOverrides,
    weightRules,
    purityPricingRules,
    ...fields
  } = input;
  if (Object.hasOwn(fields, 'slug') && fields.slug) {
    fields.slug = slugify(fields.slug);
  }
  if (Object.hasOwn(fields, 'goldWeightGrams') || Object.hasOwn(fields, 'diamondWeightGrams')) {
    const goldWeightGrams = Object.hasOwn(fields, 'goldWeightGrams')
      ? fields.goldWeightGrams
      : existing.gold_weight_grams == null
        ? null
        : Number(existing.gold_weight_grams);
    const diamondWeightGrams = Object.hasOwn(fields, 'diamondWeightGrams')
      ? fields.diamondWeightGrams
      : existing.diamond_weight_grams == null
        ? null
        : Number(existing.diamond_weight_grams);
    fields.netWeightGrams = deriveNetWeightGrams(goldWeightGrams);
    fields.grossWeightGrams = deriveGrossWeightGrams(goldWeightGrams, diamondWeightGrams);
  }
  const axesChanged =
    sizesInput !== undefined ||
    goldColors !== undefined ||
    purities !== undefined ||
    diamondConfigIds !== undefined ||
    variantOverrides !== undefined;

  // Same all-or-nothing guarantee as adminCreateProduct — the row update,
  // variant-matrix regeneration, rule re-application, and price-cache
  // refresh either all land or none do.
  const product = await withTransaction(async () => {
    await updateProductRow(id, fields);
    if (axesChanged) {
      // A PATCH-style update that only touches one axis (e.g. just Purity)
      // shouldn't wipe out the others — fall back to what's currently
      // configured for any axis this request didn't include.
      const currentCatalogue = await findProductAttributeCatalogue(id);
      const currentValues = (code, pick) => currentCatalogue.find((a) => a.code === code)?.values.map(pick) ?? [];
      // Existing size *labels* are preserved even when this update doesn't
      // touch sizes at all (needed so the cross-product below still includes
      // the size axis) — new stock/weight seeds only matter for a genuinely
      // new combination (e.g. a newly added color crossed with an existing
      // size), which intentionally starts at 0 stock pending admin review via
      // the variant editor, same as any other brand-new combination.
      const preservedSizes = currentValues('size', (v) => ({
        label: v.value,
        stockQuantity: 0,
        weightGrams: null,
        diamondWeightCarats: null,
      }));
      await syncProductVariants(id, {
        goldColors: goldColors ?? currentValues('gold_color', (v) => v.value),
        purities: purities ?? currentValues('purity', (v) => v.value),
        diamondConfigIds: diamondConfigIds ?? currentValues('diamond_quality', (v) => v.refId),
        sizes: sizesInput ?? preservedSizes,
        stockQuantity: fields.stockQuantity ?? existing.stock_quantity,
        variantOverrides,
      });
      // Only when the request actually included sizes (not the
      // label-only preservedSizes fallback, which carries a meaningless
      // placeholder stockQuantity of 0 for every row) — applies any size
      // whose Stock the admin actually changed to every existing variant
      // of that size.
      if (sizesInput !== undefined) {
        await applySizeStockUpdates(id, sizesInput);
      }
      // A removed purity/size can leave orphaned product_weight_rules/
      // product_purity_pricing_rules rows behind — both FK the attribute_value
      // directly, not the product_attribute_values join syncProductVariants
      // just resynced, so they don't cascade on their own. Runs regardless of
      // whether this same request also sends weightRules/purityPricingRules
      // (harmless no-op then — an explicit replace below can only reference
      // currently-offered values anyway) so a request that changes axes
      // WITHOUT touching the rule sections still cleans up correctly.
      await pruneOrphanedPurityRules(id);
    }
    // Resolved against this product's current purities/sizes — whatever
    // syncProductVariants above just left in place, or (if axesChanged was
    // false) whatever was already saved.
    await applyWeightAndPricingRulesInTx(id, { weightRules, purityPricingRules });
    await applyBaseProductPricing(id, fields.isPriceLocked ?? existing.is_price_locked);
    return findProductById(id);
  });

  await invalidateProductPages(product, existing.category_id);
  const attributes = await findProductAttributeCatalogue(id);
  const variants = await findVariantsByProductId(id);
  return { ...product, attributes, variants };
}

// Public/customer-facing price preview for a specific variant — reuses the
// same numeric engine as cart/checkout so the number shown while shopping
// always matches what gets charged.
export async function previewProductVariantPricing(id, { variantId }) {
  const product = await findProductById(id);
  if (!product || product.status !== 'PUBLISHED') throw new NotFoundError('Product not found');

  let variant = null;
  if (variantId) {
    variant = await findVariantById(variantId);
    if (!variant || variant.product_id !== id) {
      throw new NotFoundError('Selected variant is not available for this product');
    }
    if (!variant.is_available) {
      throw new AppError(409, 'Selected combination is no longer available');
    }
  }

  const pricing = await computeVariantPricing(product, variant);
  const mrp = Number(product.mrp);
  const discountPercent =
    mrp && mrp > pricing.sellingPrice ? Math.round(((mrp - pricing.sellingPrice) / mrp) * 100) : 0;
  return { ...pricing, mrp, discountPercent };
}

// Admin variant editor — one row per real combination, each with its own
// live price (same engine as everywhere else) so the admin sees exactly
// what a shopper would be charged for that exact combination.
export async function adminListVariants(productId) {
  const product = await findProductById(productId);
  if (!product) throw new NotFoundError('Product not found');
  const variants = await findVariantsByProductId(productId);
  const weightRules = await findWeightRuleValuesByProduct(productId);
  const purityPricingRules = await findPurityPricingRuleValuesByProduct(productId);
  return Promise.all(
    variants.map(async (variant) => {
      const pricing = await computeVariantPricing(
        product,
        variant.combination_key === '' ? null : variant,
        weightRules,
        purityPricingRules,
      );
      return { variant, pricing };
    }),
  );
}

export async function adminUpdateVariant(productId, variantId, fields) {
  const product = await findProductById(productId);
  if (!product) throw new NotFoundError('Product not found');
  const existing = await findVariantById(variantId);
  if (!existing || existing.product_id !== productId) throw new NotFoundError('Variant not found');

  const updated = await withTransaction(async () => {
    const u = await updateVariantFields(productId, variantId, fields);
    // The product's own cached "cheapest available" price can shift once a
    // specific variant's stock/weight/availability changes (e.g. the admin
    // just made the previously-cheapest combination unavailable).
    await applyBaseProductPricing(productId, product.is_price_locked);
    return u;
  });
  await safeInvalidateProductPages(product, 'adminUpdateVariant');
  const pricing = await computeVariantPricing(product, updated.combination_key === '' ? null : updated);
  return { variant: updated, pricing };
}

// Bulk-edit toolbar on the Advanced Variant Management table — same fields
// as adminUpdateVariant, applied to many rows in one call instead of N
// separate requests. "Reset to inherited" is this same endpoint called with
// weight/priceOverride fields explicitly set to null.
export async function adminBulkUpdateVariants(productId, variantIds, fields) {
  const product = await findProductById(productId);
  if (!product) throw new NotFoundError('Product not found');

  const updated = await withTransaction(async () => {
    const rows = await bulkUpdateVariantFields(productId, variantIds, fields);
    await applyBaseProductPricing(productId, product.is_price_locked);
    return rows;
  });
  await safeInvalidateProductPages(product, 'adminBulkUpdateVariants');

  const weightRules = await findWeightRuleValuesByProduct(productId);
  const purityPricingRules = await findPurityPricingRuleValuesByProduct(productId);
  return Promise.all(
    updated.map(async (variant) => ({
      variant,
      pricing: await computeVariantPricing(
        product,
        variant.combination_key === '' ? null : variant,
        weightRules,
        purityPricingRules,
      ),
    })),
  );
}

// Weight Defaults — Purity and Purity+Size live weight resolution levels
// (see product_weight_rules migration for the full priority chain). The
// admin's "Weight Defaults" screen edits the whole set at once and saves
// with one action, so this is a full replace, not incremental CRUD.
export async function adminGetWeightRules(productId) {
  const product = await findProductById(productId);
  if (!product) throw new NotFoundError('Product not found');
  return findWeightRulesByProduct(productId);
}

export async function adminReplaceWeightRules(productId, { purityRules = [], puritySizeRules = [] }) {
  const product = await findProductById(productId);
  if (!product) throw new NotFoundError('Product not found');

  const { resolve } = await buildPurityAndSizeResolver(productId);

  // De-duplicated by (purity, size) so a caller sending the same pair twice
  // doesn't trip the DB's unique index — last one wins, matching how a form
  // re-submitting its own state would behave.
  const resolved = new Map();
  for (const r of purityRules) {
    const { purityValueId, sizeValueId } = resolve(r.purity, null);
    resolved.set(`${purityValueId}|`, { purityValueId, sizeValueId, goldWeightGrams: r.goldWeightGrams });
  }
  for (const r of puritySizeRules) {
    const { purityValueId, sizeValueId } = resolve(r.purity, r.sizeLabel);
    resolved.set(`${purityValueId}|${sizeValueId}`, { purityValueId, sizeValueId, goldWeightGrams: r.goldWeightGrams });
  }

  await withTransaction(async () => {
    await replaceWeightRules(productId, [...resolved.values()]);
    await applyBaseProductPricing(productId, product.is_price_locked);
  });
  await safeInvalidateProductPages(product, 'adminReplaceWeightRules');

  return findWeightRulesByProduct(productId);
}

// Purity Pricing Rules — Product+Purity overrides for making charge %,
// making charge discount %, and diamond discount %, all otherwise flat
// product-level fields (see product_purity_pricing_rules migration). Same
// "whole-set replace" shape as Weight Defaults, but resolved per-field with
// `??` rather than requiring every field to be set — a rule can override
// just one of the three and inherit the other two from the product.
export async function adminGetPurityPricingRules(productId) {
  const product = await findProductById(productId);
  if (!product) throw new NotFoundError('Product not found');

  const catalogue = await findProductAttributeCatalogue(productId);
  const purityValues = catalogue.find((a) => a.code === 'purity')?.values ?? [];
  const rules = await findPurityPricingRulesByProduct(productId);
  const ruleByPurityId = new Map(rules.map((r) => [r.purity_value_id, r]));

  return purityValues.map((p) => {
    const rule = ruleByPurityId.get(p.id) ?? null;
    const effective = resolvePurityPricingFields(product, rule);
    return {
      purityValueId: p.id,
      purity: p.value,
      purityLabel: p.label,
      makingChargePercent: rule ? (rule.making_charge_percent == null ? null : Number(rule.making_charge_percent)) : null,
      makingChargeDiscountPercent: rule
        ? rule.making_charge_discount_percent == null
          ? null
          : Number(rule.making_charge_discount_percent)
        : null,
      diamondDiscountPercent: rule
        ? rule.diamond_discount_percent == null
          ? null
          : Number(rule.diamond_discount_percent)
        : null,
      effectiveMakingChargePercent: effective.makingChargePercent,
      effectiveMakingChargeDiscountPercent: effective.makingChargeDiscountPercent,
      effectiveDiamondDiscountPercent: effective.diamondDiscountPercent,
    };
  });
}

export async function adminReplacePurityPricingRules(productId, { purityPricingRules = [] }) {
  const product = await findProductById(productId);
  if (!product) throw new NotFoundError('Product not found');

  const catalogue = await findProductAttributeCatalogue(productId);
  const purityValueIds = new Set((catalogue.find((a) => a.code === 'purity')?.values ?? []).map((v) => v.id));
  for (const r of purityPricingRules) {
    if (!purityValueIds.has(r.purityValueId)) {
      throw new AppError(409, 'One or more purities are not offered by this product');
    }
  }

  const rows = purityPricingRules.map((r) => ({
    purityValueId: r.purityValueId,
    makingChargePercent: r.makingChargePercent ?? null,
    makingChargeDiscountPercent: r.makingChargeDiscountPercent ?? null,
    diamondDiscountPercent: r.diamondDiscountPercent ?? null,
  }));

  await withTransaction(async () => {
    await replacePurityPricingRules(productId, rows);
    await applyBaseProductPricing(productId, product.is_price_locked);
  });
  await safeInvalidateProductPages(product, 'adminReplacePurityPricingRules');

  return adminGetPurityPricingRules(productId);
}

// Availability Rules — per-product pairwise exclusions ("this product's Rose
// Gold isn't offered in 9K"), replacing the old universal hardcoded rule.
// Values must both actually be offered by this product (in its
// product_attribute_values) and come from two different attributes — a rule
// within one attribute (e.g. two purities) has no meaning here.
export async function adminListExclusionRules(productId) {
  const product = await findProductById(productId);
  if (!product) throw new NotFoundError('Product not found');
  return findExclusionRulesByProduct(productId);
}

export async function adminCreateExclusionRule(productId, { attributeValueIdA, attributeValueIdB }) {
  const product = await findProductById(productId);
  if (!product) throw new NotFoundError('Product not found');

  const catalogue = await findProductAttributeCatalogue(productId);
  const codeByValueId = new Map();
  for (const attr of catalogue) {
    for (const v of attr.values) codeByValueId.set(v.id, attr.code);
  }
  const codeA = codeByValueId.get(attributeValueIdA);
  const codeB = codeByValueId.get(attributeValueIdB);
  if (!codeA || !codeB) throw new AppError(409, 'Both values must be offered by this product');
  if (codeA === codeB) throw new AppError(409, 'A rule must be between two different attributes');

  return withTransaction(async () => {
    const rule = await createExclusionRule(productId, attributeValueIdA, attributeValueIdB);
    await applyExclusionRules(productId);
    await applyBaseProductPricing(productId, product.is_price_locked);
    return rule;
  });
}

export async function adminDeleteExclusionRule(productId, ruleId) {
  const product = await findProductById(productId);
  if (!product) throw new NotFoundError('Product not found');
  await withTransaction(async () => {
    await deleteExclusionRule(productId, ruleId);
    await applyExclusionRules(productId);
    await applyBaseProductPricing(productId, product.is_price_locked);
  });
}

export async function adminDeleteProduct(id) {
  const existing = await findProductById(id);
  if (!existing) throw new NotFoundError('Product not found');
  await deleteProductRow(id);
  await invalidateProductPages(existing);
}
