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
import { syncProductVariants, applyExclusionRules, applySizeStockUpdates } from './variantSyncService.js';
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
  findCategoryBySlug,
  getCategoryAndDescendantIds,
} from '../repositories/categories.repository.js';
import { findCollectionBySlug } from '../repositories/collections.repository.js';
import { findDiamondConfigById } from '../repositories/diamondConfigs.repository.js';
import { computeVariantPricing } from './pricingService.js';
import { invalidateProductPages } from './pageCacheInvalidation.js';

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

// A product's listing/base price — and the PDP's price before the shopper
// touches anything — must reflect what a shopper can actually buy for the
// least money. Runs AFTER variants are synced (it needs real variant rows
// to scan), computes every available variant's full live price (not just
// weight — Purity, Diamond Quality, and now Gold Color can each move price
// independently), and caches the cheapest one's pre-offer numbers onto the
// product row. This intentionally supersedes the old size-only "cheapest
// weight" heuristic — every axis can now affect price, not just size.
export async function applyCheapestVariantPricing(productId, isPriceLocked) {
  if (isPriceLocked) return;
  const product = await findProductById(productId);
  if (!product) return;

  const variants = await findAvailableVariantsByProductId(productId);
  if (!variants.length) return;

  // Fetched once and passed to every computeVariantPricing call below —
  // otherwise each of N variants would re-query the same product's weight
  // rules individually.
  const weightRules = await findWeightRuleValuesByProduct(productId);

  let cheapest = null;
  for (const variant of variants) {
    const pricing = await computeVariantPricing(product, variant.combination_key === '' ? null : variant, weightRules);
    if (!cheapest || pricing.sellingPrice < cheapest.sellingPrice) cheapest = pricing;
  }
  if (!cheapest) return;
  if (Math.abs(cheapest.sellingPriceOriginal - Number(product.selling_price)) < 1e-9) return;

  await updateProductRow(productId, {
    goldValue: cheapest.goldValue,
    diamondValue: cheapest.diamondValueOriginal,
    makingCharge: cheapest.makingChargeOriginal,
    sellingPrice: cheapest.sellingPriceOriginal,
  });
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
  const { sizes: sizesInput, goldColors, purities, diamondConfigIds, variantOverrides, ...fields } = input;
  fields.netWeightGrams = deriveNetWeightGrams(fields.goldWeightGrams);
  fields.grossWeightGrams = deriveGrossWeightGrams(fields.goldWeightGrams, fields.diamondWeightGrams);

  // The row insert, variant-matrix generation, rule/override application,
  // and cheapest-price cache refresh all succeed or fail together — a
  // mid-sequence failure (e.g. a DB hiccup after variants are created but
  // before pricing is cached) used to leave a half-configured product
  // behind instead of rolling back to nothing.
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
    await applyCheapestVariantPricing(created.id, fields.isPriceLocked ?? created.is_price_locked);
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

  const { sizes: sizesInput, goldColors, purities, diamondConfigIds, variantOverrides, ...fields } = input;
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
    }
    await applyCheapestVariantPricing(id, fields.isPriceLocked ?? existing.is_price_locked);
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
  return Promise.all(
    variants.map(async (variant) => {
      const pricing = await computeVariantPricing(product, variant.combination_key === '' ? null : variant, weightRules);
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
    await applyCheapestVariantPricing(productId, product.is_price_locked);
    return u;
  });
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
    await applyCheapestVariantPricing(productId, product.is_price_locked);
    return rows;
  });

  const weightRules = await findWeightRuleValuesByProduct(productId);
  return Promise.all(
    updated.map(async (variant) => ({
      variant,
      pricing: await computeVariantPricing(product, variant.combination_key === '' ? null : variant, weightRules),
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
    await applyCheapestVariantPricing(productId, product.is_price_locked);
  });

  return findWeightRulesByProduct(productId);
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
    await applyCheapestVariantPricing(productId, product.is_price_locked);
    return rule;
  });
}

export async function adminDeleteExclusionRule(productId, ruleId) {
  const product = await findProductById(productId);
  if (!product) throw new NotFoundError('Product not found');
  await withTransaction(async () => {
    await deleteExclusionRule(productId, ruleId);
    await applyExclusionRules(productId);
    await applyCheapestVariantPricing(productId, product.is_price_locked);
  });
}

export async function adminDeleteProduct(id) {
  const existing = await findProductById(id);
  if (!existing) throw new NotFoundError('Product not found');
  await deleteProductRow(id);
  await invalidateProductPages(existing);
}
