import { slugify } from '../utils/slug.js';
import { NotFoundError } from '../utils/AppError.js';
import {
  listProducts as listProductsRow,
  findProductBySlug,
  findProductById,
  findProductImages,
  findProductSizes,
  findProductSizesByIds,
  createProduct as createProductRow,
  updateProduct as updateProductRow,
  deleteProduct as deleteProductRow,
} from '../repositories/products.repository.js';
import { replaceProductSizes } from '../repositories/productSizes.repository.js';
import {
  findProductVariantOptions,
  replaceGoldColors,
  replacePurityOptions,
  replaceDiamondOptions,
} from '../repositories/productVariantOptions.repository.js';
import {
  findCategoryBySlug,
  getCategoryAndDescendantIds,
} from '../repositories/categories.repository.js';
import { findCollectionBySlug } from '../repositories/collections.repository.js';
import { findDiamondConfigById } from '../repositories/diamondConfigs.repository.js';
import { computeVariantPricing, computeGoldValue, computeDiamondValue, computeSellingPrice } from './pricingService.js';
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
// least money. Without this, an admin-entered base Gold Weight that doesn't
// match any real size (e.g. lighter than every size, so never actually
// purchasable as-is) makes the listing card quote a price nobody can pay —
// the PDP then jumps to a different number the moment a size is
// auto-selected. Recomputes goldValue/diamondValue/sellingPrice off the
// cheapest size's own weight (and diamond weight, if that size overrides it)
// so the two always agree.
//
// Purity and Diamond Quality have no equivalent fix here: unlike sizes
// (which have no "admin default" — every size is just stock, and any of
// them might be lighter than the base weight), the PDP defaults Purity and
// Diamond Quality to whichever value the admin themselves set as the
// product's own base configuration (see web/src/pages/PDPPage.tsx) — so the
// stored base price already matches what's shown by default, with no
// reconciliation needed on those two axes.
async function applyCheapestSizePricing(fields, sizesInput, existing) {
  const isPriceLocked = Object.hasOwn(fields, 'isPriceLocked') ? fields.isPriceLocked : existing?.is_price_locked;
  if (isPriceLocked) return;

  const metalType = Object.hasOwn(fields, 'metalType') ? fields.metalType : existing?.metal_type;
  const effectivePurity = Object.hasOwn(fields, 'purity') ? fields.purity : existing?.purity;
  if (metalType !== 'GOLD' || !effectivePurity) return;

  // A price-only edit that doesn't touch sizes shouldn't skip reconciling
  // against sizes that already exist in the DB from an earlier save.
  const sizes =
    sizesInput !== undefined
      ? sizesInput
      : existing
        ? (await findProductSizes(existing.id)).map((s) => ({
            weightGrams: s.weight_grams == null ? null : Number(s.weight_grams),
            diamondWeightCarats: s.diamond_weight_carats == null ? null : Number(s.diamond_weight_carats),
          }))
        : [];
  if (!sizes.length) return;

  const baseWeightGrams = Object.hasOwn(fields, 'goldWeightGrams')
    ? fields.goldWeightGrams
    : existing?.gold_weight_grams == null
      ? null
      : Number(existing.gold_weight_grams);
  const baseDiamondWeightCarats = Object.hasOwn(fields, 'diamondWeightCarats')
    ? fields.diamondWeightCarats
    : existing?.diamond_weight_carats == null
      ? null
      : Number(existing.diamond_weight_carats);

  // Base weight is only a legitimate standalone price when there are no
  // sizes at all — once sizes exist, a shopper always has to pick one, so
  // the real floor is the minimum across every size's own effective weight
  // (its override, or the base weight for a size that has none), never the
  // base weight compared in isolation.
  let effectiveWeightGrams = baseWeightGrams;
  let effectiveDiamondWeightCarats = baseDiamondWeightCarats;
  if (sizes.length) {
    effectiveWeightGrams = null;
    for (const s of sizes) {
      const weightGrams = s.weightGrams ?? baseWeightGrams;
      if (weightGrams != null && (effectiveWeightGrams == null || weightGrams < effectiveWeightGrams)) {
        effectiveWeightGrams = weightGrams;
        effectiveDiamondWeightCarats = s.diamondWeightCarats ?? baseDiamondWeightCarats;
      }
    }
  }
  if (effectiveWeightGrams == null) return;
  if (baseWeightGrams != null && Math.abs(effectiveWeightGrams - baseWeightGrams) < 1e-9) return;

  const { goldValue } = await computeGoldValue(effectiveWeightGrams, effectivePurity);

  const effectiveDiamondConfigId = Object.hasOwn(fields, 'diamondConfigId')
    ? fields.diamondConfigId
    : existing?.diamond_config_id;

  let diamondValue = 0;
  if (effectiveDiamondWeightCarats && effectiveDiamondConfigId) {
    diamondValue = (await computeDiamondValue(effectiveDiamondWeightCarats, effectiveDiamondConfigId)).diamondValue;
  }

  const makingChargePercent = Object.hasOwn(fields, 'makingChargePercent')
    ? fields.makingChargePercent
    : existing?.making_charge_percent == null
      ? null
      : Number(existing.making_charge_percent);
  const flatMakingCharge = Object.hasOwn(fields, 'makingCharge')
    ? fields.makingCharge
    : existing?.making_charge == null
      ? 0
      : Number(existing.making_charge);
  // Same live-%-of-gold-value rule as computeVariantPricing — the cheapest
  // size's own (lighter) gold value, not the base weight's, so the making
  // charge this recomputes selling_price from actually matches what that
  // size would show.
  const makingCharge =
    makingChargePercent != null && goldValue > 0
      ? Math.round(goldValue * (makingChargePercent / 100) * 100) / 100
      : flatMakingCharge;
  const gstPercent = Object.hasOwn(fields, 'gstPercent')
    ? fields.gstPercent
    : existing?.gst_percent == null
      ? 3
      : Number(existing.gst_percent);

  fields.goldValue = goldValue;
  fields.diamondValue = diamondValue;
  // Keep the cached flat column in step with the cheapest-size gold value
  // too, not just selling_price — otherwise the two drift apart the moment
  // making charge is percent-based (this used to be a no-op change since
  // making_charge never varied by weight before).
  fields.makingCharge = makingCharge;
  fields.sellingPrice = computeSellingPrice({ goldValue, diamondValue, makingCharge, gstPercent });
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
  const sizes = await findProductSizes(product.id);
  const variantOptions = await findProductVariantOptions(product.id);
  const diamondConfigName = product.diamond_config_id
    ? ((await findDiamondConfigById(product.diamond_config_id))?.name ?? null)
    : null;
  return { ...product, images, sizes, variantOptions, diamondConfigName };
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
  const sizes = await findProductSizes(id);
  const variantOptions = await findProductVariantOptions(id);
  return { ...product, images, sizes, variantOptions };
}

export async function adminCreateProduct(input) {
  const slug = input.slug ? slugify(input.slug) : slugify(input.name);
  const { sizes: sizesInput, goldColors, purities, diamondConfigIds, ...fields } = input;
  fields.netWeightGrams = deriveNetWeightGrams(fields.goldWeightGrams);
  fields.grossWeightGrams = deriveGrossWeightGrams(fields.goldWeightGrams, fields.diamondWeightGrams);
  await applyCheapestSizePricing(fields, sizesInput, null);
  let product = await createProductRow({ ...fields, slug, status: input.status ?? 'DRAFT' });
  if (sizesInput !== undefined) {
    await replaceProductSizes(product.id, sizesInput);
  }
  if (goldColors !== undefined) await replaceGoldColors(product.id, goldColors);
  if (purities !== undefined) await replacePurityOptions(product.id, purities);
  if (diamondConfigIds !== undefined) await replaceDiamondOptions(product.id, diamondConfigIds);
  if (sizesInput !== undefined) {
    // available_stock rolls up from sizes — re-fetch so the response (and
    // the invalidation payload) reflects the just-saved sizes, not the
    // pre-sizes snapshot returned by createProductRow.
    product = await findProductById(product.id);
  }
  await invalidateProductPages(product);
  const sizes = await findProductSizes(product.id);
  const variantOptions = await findProductVariantOptions(product.id);
  return { ...product, sizes, variantOptions };
}

export async function adminUpdateProduct(id, input) {
  const existing = await findProductById(id);
  if (!existing) throw new NotFoundError('Product not found');

  const { sizes: sizesInput, goldColors, purities, diamondConfigIds, ...fields } = input;
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
  await applyCheapestSizePricing(fields, sizesInput, existing);
  let product = await updateProductRow(id, fields);
  if (sizesInput !== undefined) {
    await replaceProductSizes(id, sizesInput);
  }
  if (goldColors !== undefined) await replaceGoldColors(id, goldColors);
  if (purities !== undefined) await replacePurityOptions(id, purities);
  if (diamondConfigIds !== undefined) await replaceDiamondOptions(id, diamondConfigIds);
  if (sizesInput !== undefined) {
    product = await findProductById(id);
  }
  await invalidateProductPages(product, existing.category_id);
  const sizes = await findProductSizes(id);
  const variantOptions = await findProductVariantOptions(id);
  return { ...product, sizes, variantOptions };
}

// Public/customer-facing price preview for a purity/diamond-quality
// combination — reuses the same numeric engine as cart/checkout so the
// number shown while shopping always matches what gets charged.
export async function previewProductVariantPricing(id, { purity, diamondConfigId, sizeId }) {
  const product = await findProductById(id);
  if (!product || product.status !== 'PUBLISHED') throw new NotFoundError('Product not found');

  const options = await findProductVariantOptions(id);
  if (purity && !options.purities.includes(purity)) {
    throw new NotFoundError('Selected purity is not available for this product');
  }
  if (diamondConfigId && !options.diamondOptions.some((d) => d.id === diamondConfigId)) {
    throw new NotFoundError('Selected diamond quality is not available for this product');
  }

  let sizeWeightGrams = null;
  let sizeDiamondWeightCarats = null;
  if (sizeId) {
    const [size] = await findProductSizesByIds([sizeId]);
    if (!size || size.product_id !== id) {
      throw new NotFoundError('Selected size is not available for this product');
    }
    sizeWeightGrams = size.weight_grams != null ? Number(size.weight_grams) : null;
    sizeDiamondWeightCarats =
      size.diamond_weight_carats != null ? Number(size.diamond_weight_carats) : null;
  }

  const pricing = await computeVariantPricing(product, {
    purity,
    diamondConfigId,
    sizeWeightGrams,
    sizeDiamondWeightCarats,
  });
  const mrp = Number(product.mrp);
  const discountPercent =
    mrp && mrp > pricing.sellingPrice ? Math.round(((mrp - pricing.sellingPrice) / mrp) * 100) : 0;
  return { ...pricing, mrp, discountPercent };
}

export async function adminDeleteProduct(id) {
  const existing = await findProductById(id);
  if (!existing) throw new NotFoundError('Product not found');
  await deleteProductRow(id);
  await invalidateProductPages(existing);
}
