import {
  listProductsQuerySchema,
  adminListProductsQuerySchema,
  createProductSchema,
  updateProductSchema,
  featuredSchema,
  bestSellerSchema,
  variantPricePreviewQuerySchema,
  updateVariantSchema,
  bulkUpdateVariantSchema,
} from '../validators/products.validators.js';
import { createExclusionRuleSchema } from '../validators/exclusionRules.validators.js';
import { replaceWeightRulesSchema } from '../validators/weightRules.validators.js';
import * as productsService from '../services/productsService.js';
import { applyProductOffer } from '../services/pricingService.js';
import { AppError } from '../utils/AppError.js';

// The generic "Already exists" the shared error handler falls back to for
// every 23505 doesn't tell the admin WHICH field collided or what to do
// about it — both the SKU and the name-derived slug are unique, and a slug
// clash in particular is easy to hit by accident (two products with the
// same name).
function productConflictMessage(err) {
  if (err.constraint === 'products_sku_key') return 'A product with this SKU already exists.';
  if (err.constraint === 'products_slug_key') {
    return 'A product with this name already exists — please use a different name (or add a distinguishing detail like a size or metal color).';
  }
  return null;
}

export function discountPercent(mrp, sellingPrice) {
  if (!mrp || mrp <= sellingPrice) return 0;
  return Math.round(((mrp - sellingPrice) / mrp) * 100);
}

// Distinct from the MRP-vs-sellingPrice discount badge — this is the
// specific "X% off Making Charge / Diamond" promotional offer an admin can
// set per product (plan: "give offer making charge and diamonds"), shown on
// both the listing card and the detail page.
export function offerLabel(makingChargeDiscountPercent, diamondDiscountPercent) {
  const parts = [];
  if (makingChargeDiscountPercent > 0) parts.push(`${makingChargeDiscountPercent}% off Making Charge`);
  if (diamondDiscountPercent > 0) parts.push(`${diamondDiscountPercent}% off Diamond`);
  return parts.length ? parts.join(' + ') : null;
}

export function rowOffer(row) {
  return applyProductOffer({
    goldValue: Number(row.gold_value),
    diamondValue: Number(row.diamond_value),
    makingCharge: Number(row.making_charge),
    gstPercent: Number(row.gst_percent),
    sellingPrice: Number(row.selling_price),
    makingChargeDiscountPercent: Number(row.making_charge_discount_percent ?? 0),
    diamondDiscountPercent: Number(row.diamond_discount_percent ?? 0),
  });
}

// "NEW" badge window for the PLP — no bestseller/trending signal exists yet
// (no real sales/analytics data to back those honestly), so only this one
// is auto-computed, from the timestamp that already exists on every product.
const NEW_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
function isRecentlyPublished(createdAt) {
  return createdAt != null && Date.now() - new Date(createdAt).getTime() < NEW_WINDOW_MS;
}

// Card-shaped DTO for listings — intentionally excludes full description,
// jewellery attributes, etc. (plan §13: "server sends only fields each
// screen needs").
export function toListDto(row) {
  const offer = rowOffer(row);
  return {
    id: row.id,
    slug: row.slug,
    categorySlug: row.category_slug,
    name: row.name,
    metalType: row.metal_type,
    purity: row.purity,
    goldColor: row.gold_color,
    diamondColour: row.diamond_colour,
    diamondClarity: row.diamond_clarity,
    sellingPrice: offer.sellingPrice,
    sellingPriceOriginal: offer.sellingPriceOriginal,
    mrp: Number(row.mrp),
    discountPercent: discountPercent(Number(row.mrp), offer.sellingPrice),
    offerLabel: offerLabel(offer.makingChargeDiscountPercent, offer.diamondDiscountPercent),
    primaryImageUrl: row.primary_image_url,
    availableStock: row.available_stock,
    ratingAvg: Number(row.rating_avg),
    ratingCount: row.rating_count,
    isFeatured: row.is_featured,
    isBestSeller: row.is_best_seller,
    isNew: isRecentlyPublished(row.created_at),
    ...(row.status ? { status: row.status } : {}),
  };
}

function toDetailDto(row) {
  const offer = rowOffer(row);
  const gstAmount =
    Math.round((offer.sellingPrice - offer.goldValue - offer.diamondValue - offer.makingCharge) * 100) / 100;

  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    sku: row.sku,
    categoryId: row.category_id,
    collectionId: row.collection_id,
    shortDescription: row.short_description,
    fullDescription: row.full_description,

    metalType: row.metal_type,
    purity: row.purity,
    goldColor: row.gold_color,
    grossWeightGrams: row.gross_weight_grams == null ? null : Number(row.gross_weight_grams),
    netWeightGrams: row.net_weight_grams == null ? null : Number(row.net_weight_grams),
    goldWeightGrams: row.gold_weight_grams == null ? null : Number(row.gold_weight_grams),
    diamondWeightGrams: row.diamond_weight_grams == null ? null : Number(row.diamond_weight_grams),
    diamondWeightCarats:
      row.diamond_weight_carats == null ? null : Number(row.diamond_weight_carats),
    diamondConfigId: row.diamond_config_id,
    diamondConfigName: row.diamondConfigName ?? null,
    diamondCount: row.diamond_count,
    diamondType: row.diamond_type,
    diamondColour: row.diamond_colour,
    diamondClarity: row.diamond_clarity,
    gemstone: row.gemstone,
    certification: row.certification,
    productSize: row.product_size,
    // Overrides the "Size" wording on the admin form and storefront (e.g.
    // "Length" for a chain) — null means plain "Size", today's default.
    sizeLabel: row.size_label,
    careInstructions: row.care_instructions,

    priceBreakup: {
      goldValue: offer.goldValue,
      diamondValue: offer.diamondValue,
      diamondValueOriginal: offer.diamondValueOriginal,
      makingCharge: offer.makingCharge,
      makingChargeOriginal: offer.makingChargeOriginal,
      makingChargeDiscountPercent: offer.makingChargeDiscountPercent,
      diamondDiscountPercent: offer.diamondDiscountPercent,
      gstAmount,
      total: offer.sellingPrice,
    },
    // Source of truth for live making-charge recalculation (null = still on
    // the flat priceBreakup.makingChargeOriginal above — platinum, or never
    // migrated to percent-based pricing).
    makingChargePercent: row.making_charge_percent == null ? null : Number(row.making_charge_percent),
    mrp: Number(row.mrp),
    sellingPrice: offer.sellingPrice,
    // The admin-set base price before this offer's discount — the admin
    // edit form loads FROM this (not the discounted `sellingPrice` above),
    // so re-saving a discounted product doesn't bake the discount in as the
    // new base and compound it further on the next read.
    sellingPriceOriginal: offer.sellingPriceOriginal,
    discountPercent: discountPercent(Number(row.mrp), offer.sellingPrice),
    offerLabel: offerLabel(offer.makingChargeDiscountPercent, offer.diamondDiscountPercent),

    stockQuantity: row.stock_quantity,
    availableStock: row.available_stock,
    status: row.status,
    isPriceLocked: row.is_price_locked,
    isFeatured: row.is_featured,
    isBestSeller: row.is_best_seller,
    showDeliveryChecker: row.show_delivery_checker,
    isNew: isRecentlyPublished(row.created_at),

    metaTitle: row.meta_title,
    metaDescription: row.meta_description,
    metaKeywords: row.meta_keywords,

    ratingAvg: Number(row.rating_avg),
    ratingCount: row.rating_count,

    images: (row.images ?? []).map((img) => ({
      id: img.id,
      type: img.type,
      variant: img.variant,
      format: img.format,
      url: img.url,
      isPrimary: img.is_primary,
      sortOrder: img.sort_order,
    })),

    // Admin-defined dimensions this product offers values on (Purity, Gold
    // Color, Diamond Quality, Size, and whatever's added later) — replaces
    // the old fixed goldColorOptions/purityOptions/diamondOptions/sizes
    // fields with one generic, attribute-count-agnostic shape.
    attributes: (row.attributes ?? []).map((a) => ({
      code: a.code,
      name: a.name,
      values: a.values.map((v) => ({ id: v.id, value: v.value, label: v.label, refId: v.refId })),
    })),

    // One real sellable combination per entry — a product with nothing
    // configured has exactly one (the synthetic default, empty
    // attributeValueIds). isAvailable gates selectability; combinations that
    // were never configured for this product simply don't appear here at
    // all (no separate "invalid combination" list needed).
    variants: (row.variants ?? []).map((v) => ({
      id: v.id,
      isAvailable: v.is_available,
      stockQuantity: v.stock_quantity,
      availableStock: v.stock_quantity,
      goldWeightGrams: v.gold_weight_grams == null ? null : Number(v.gold_weight_grams),
      diamondWeightGrams: v.diamond_weight_grams == null ? null : Number(v.diamond_weight_grams),
      diamondWeightCarats: v.diamond_weight_carats == null ? null : Number(v.diamond_weight_carats),
      attributeValueIds: Object.values(v.attributes ?? {}).map((a) => a.valueId),
    })),

    // Admin-form-shaped convenience views, derived from `attributes` above —
    // the admin's "Customer-Selectable Variations" section still edits axes
    // as flat lists (unchanged UI), and the storefront's SizeSelector still
    // reads a flat `sizes` prop directly — this keeps both working without
    // either needing to understand the generic attribute shape. A size's
    // stockQuantity/availableStock is ONE number shared uniformly across
    // every Gold Colour × Purity × Diamond Quality combo carrying that size
    // — matching applySizeStockUpdates/syncProductVariants, which both write
    // the admin's typed value to every one of those combos as-is, not
    // divided (the "old pre-variant-model mental model of one stock count
    // per size"). Take the max across combos as the representative figure —
    // exact once they're in sync (the normal case after any save), and
    // robust rather than silently under-reporting if a combo was excluded
    // (0) or hasn't been synced yet. Previously this summed across combos
    // instead, which double/N-counted the same number the admin form itself
    // re-displays and re-submits — every resave multiplied the stored value
    // by the combo count instead of leaving it unchanged (bug: entering
    // 1000 with 28 sibling combos round-tripped to 28000 on save).
    sizes: (row.attributes ?? [])
      .find((a) => a.code === 'size')
      ?.values.map((v) => {
        const stock = (row.variants ?? [])
          .filter((variant) => Object.values(variant.attributes ?? {}).some((a) => a.valueId === v.id))
          .reduce((max, variant) => Math.max(max, variant.is_available ? variant.stock_quantity : 0), 0);
        return { id: v.id, label: v.label, stockQuantity: stock, availableStock: stock, weightGrams: null, diamondWeightCarats: null };
      }) ?? [],
    goldColorOptions: (row.attributes ?? []).find((a) => a.code === 'gold_color')?.values.map((v) => v.value) ?? [],
    purityOptions: (row.attributes ?? []).find((a) => a.code === 'purity')?.values.map((v) => v.value) ?? [],
    diamondOptions:
      (row.attributes ?? [])
        .find((a) => a.code === 'diamond_quality')
        ?.values.map((v) => ({ id: v.refId, name: v.label })) ?? [],
  };
}

export async function list(req, res, next) {
  try {
    const q = listProductsQuerySchema.parse(req.query);
    const { items, total } = await productsService.listPublicProducts({
      categorySlug: q.category,
      collectionSlug: q.collection,
      metalType: q.metal,
      purity: q.purity,
      goldColor: q.goldColor,
      priceMin: q.priceMin,
      priceMax: q.priceMax,
      sort: q.sort,
      page: q.page ?? 1,
      limit: q.limit ?? 24,
    });
    res.json({
      products: items.map(toListDto),
      page: q.page ?? 1,
      limit: q.limit ?? 24,
      total,
      totalPages: Math.ceil(total / (q.limit ?? 24)),
    });
  } catch (err) {
    next(err);
  }
}

export async function getBySlug(req, res, next) {
  try {
    const product = await productsService.getPublicProductBySlug(req.params.slug);
    res.json({ product: toDetailDto(product) });
  } catch (err) {
    next(err);
  }
}

export async function pricePreview(req, res, next) {
  try {
    const { variantId } = variantPricePreviewQuerySchema.parse(req.query);
    const result = await productsService.previewProductVariantPricing(req.params.id, { variantId });
    res.json({
      ...result,
      offerLabel: offerLabel(result.makingChargeDiscountPercent, result.diamondDiscountPercent),
    });
  } catch (err) {
    next(err);
  }
}

export async function getRelated(req, res, next) {
  try {
    const products = await productsService.getRelatedProducts(req.params.slug, 4);
    res.json({ products: products.map(toListDto) });
  } catch (err) {
    next(err);
  }
}

export async function adminList(req, res, next) {
  try {
    const q = adminListProductsQuerySchema.parse(req.query);
    const categoryIds = await productsService.resolveCategoryIds(q.category);
    if (categoryIds && categoryIds.length === 0) {
      return res.json({ products: [], page: q.page ?? 1, limit: q.limit ?? 24, total: 0, totalPages: 0 });
    }
    const { items, total } = await productsService.adminListProducts(
      {
        categoryIds,
        collectionId: undefined,
        metalType: q.metal,
        purity: q.purity,
        goldColor: q.goldColor,
        priceMin: q.priceMin,
        priceMax: q.priceMax,
        status: q.status,
      },
      { sort: q.sort, page: q.page ?? 1, limit: q.limit ?? 24 },
    );
    res.json({
      products: items.map(toListDto),
      page: q.page ?? 1,
      limit: q.limit ?? 24,
      total,
      totalPages: Math.ceil(total / (q.limit ?? 24)),
    });
  } catch (err) {
    next(err);
  }
}

export async function adminGet(req, res, next) {
  try {
    const product = await productsService.adminGetProduct(req.params.id);
    res.json({ product: toDetailDto(product) });
  } catch (err) {
    next(err);
  }
}

export async function adminCreate(req, res, next) {
  try {
    const input = createProductSchema.parse(req.body);
    const product = await productsService.adminCreateProduct(input);
    res.status(201).json({ product: toDetailDto({ ...product, images: [] }) });
  } catch (err) {
    if (err.code === '23505') {
      const message = productConflictMessage(err);
      if (message) return next(new AppError(409, message));
    }
    next(err);
  }
}

export async function adminUpdate(req, res, next) {
  try {
    const input = updateProductSchema.parse(req.body);
    const product = await productsService.adminUpdateProduct(req.params.id, input);
    res.json({ product: toDetailDto({ ...product, images: [] }) });
  } catch (err) {
    if (err.code === '23505') {
      const message = productConflictMessage(err);
      if (message) return next(new AppError(409, message));
    }
    next(err);
  }
}

export async function adminDelete(req, res, next) {
  try {
    await productsService.adminDeleteProduct(req.params.id);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
}

export async function setFeatured(req, res, next) {
  try {
    const { featured } = featuredSchema.parse(req.body);
    const product = await productsService.adminUpdateProduct(req.params.id, { isFeatured: featured });
    res.json({ id: product.id, isFeatured: product.is_featured });
  } catch (err) {
    next(err);
  }
}

export async function setBestSeller(req, res, next) {
  try {
    const { bestSeller } = bestSellerSchema.parse(req.body);
    const product = await productsService.adminUpdateProduct(req.params.id, { isBestSeller: bestSeller });
    res.json({ id: product.id, isBestSeller: product.is_best_seller });
  } catch (err) {
    next(err);
  }
}

// One row per real combination for this product, with a human-readable
// label built from its attribute values and the exact live price a shopper
// picking that combination would be charged.
// Fixed order so a combination's label always reads the same way (e.g.
// always "9K / Yellow Gold / FL. EF / 6", never scrambled) — json_object_agg
// doesn't guarantee key order, so Object.values() alone can't be trusted.
const ATTRIBUTE_LABEL_ORDER = ['purity', 'gold_color', 'diamond_quality', 'size'];

function toVariantDto({ variant, pricing }) {
  const attributes = variant.attributes ?? {};
  const orderedCodes = [
    ...ATTRIBUTE_LABEL_ORDER.filter((code) => attributes[code]),
    ...Object.keys(attributes).filter((code) => !ATTRIBUTE_LABEL_ORDER.includes(code)),
  ];
  const attributeLabels = orderedCodes.map((code) => attributes[code].label);
  return {
    id: variant.id,
    label: attributeLabels.length > 0 ? attributeLabels.join(' / ') : 'Default',
    isAvailable: variant.is_available,
    stockQuantity: variant.stock_quantity,
    goldWeightGrams: variant.gold_weight_grams == null ? null : Number(variant.gold_weight_grams),
    diamondWeightGrams: variant.diamond_weight_grams == null ? null : Number(variant.diamond_weight_grams),
    diamondWeightCarats: variant.diamond_weight_carats == null ? null : Number(variant.diamond_weight_carats),
    sellingPrice: pricing.sellingPrice,
    priceOverride: variant.price_override == null ? null : Number(variant.price_override),
    isPriceOverridden: pricing.isPriceOverridden ?? false,
    attributeValueIds: Object.values(attributes).map((a) => a.valueId),
    excludedByRuleId: variant.excluded_by_rule_id ?? null,
  };
}

export async function listVariants(req, res, next) {
  try {
    const rows = await productsService.adminListVariants(req.params.id);
    res.json({ variants: rows.map(toVariantDto) });
  } catch (err) {
    next(err);
  }
}

export async function updateVariant(req, res, next) {
  try {
    const input = updateVariantSchema.parse(req.body);
    const result = await productsService.adminUpdateVariant(req.params.id, req.params.variantId, input);
    res.json({ variant: toVariantDto(result) });
  } catch (err) {
    next(err);
  }
}

export async function bulkUpdateVariants(req, res, next) {
  try {
    const { variantIds, fields } = bulkUpdateVariantSchema.parse(req.body);
    const results = await productsService.adminBulkUpdateVariants(req.params.id, variantIds, fields);
    res.json({ variants: results.map(toVariantDto) });
  } catch (err) {
    next(err);
  }
}

function toWeightRuleDto(rule) {
  return {
    id: rule.id,
    purity: rule.purity_value,
    purityLabel: rule.purity_label,
    sizeLabel: rule.size_label ?? null,
    goldWeightGrams: Number(rule.gold_weight_grams),
  };
}

export async function getWeightRules(req, res, next) {
  try {
    const rules = await productsService.adminGetWeightRules(req.params.id);
    res.json({ rules: rules.map(toWeightRuleDto) });
  } catch (err) {
    next(err);
  }
}

export async function replaceWeightRules(req, res, next) {
  try {
    const input = replaceWeightRulesSchema.parse(req.body);
    const rules = await productsService.adminReplaceWeightRules(req.params.id, input);
    res.json({ rules: rules.map(toWeightRuleDto) });
  } catch (err) {
    next(err);
  }
}

function toRuleDto(rule) {
  return {
    id: rule.id,
    valueA: { id: rule.value_a.id, attributeCode: rule.value_a.attributeCode, attributeName: rule.value_a.attributeName, label: rule.value_a.label },
    valueB: { id: rule.value_b.id, attributeCode: rule.value_b.attributeCode, attributeName: rule.value_b.attributeName, label: rule.value_b.label },
  };
}

export async function listExclusionRules(req, res, next) {
  try {
    const rules = await productsService.adminListExclusionRules(req.params.id);
    res.json({ rules: rules.map(toRuleDto) });
  } catch (err) {
    next(err);
  }
}

export async function createExclusionRule(req, res, next) {
  try {
    const input = createExclusionRuleSchema.parse(req.body);
    const rule = await productsService.adminCreateExclusionRule(req.params.id, input);
    res.status(201).json({ rule: toRuleDto(rule) });
  } catch (err) {
    next(err);
  }
}

export async function deleteExclusionRule(req, res, next) {
  try {
    await productsService.adminDeleteExclusionRule(req.params.id, req.params.ruleId);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
}
