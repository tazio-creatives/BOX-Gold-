import {
  listProductsQuerySchema,
  adminListProductsQuerySchema,
  createProductSchema,
  updateProductSchema,
  featuredSchema,
  variantPricePreviewQuerySchema,
} from '../validators/products.validators.js';
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

    sizes: (row.sizes ?? []).map((s) => ({
      id: s.id,
      label: s.label,
      stockQuantity: s.stock_quantity,
      availableStock: s.available_stock,
      weightGrams: s.weight_grams == null ? null : Number(s.weight_grams),
      diamondWeightCarats: s.diamond_weight_carats == null ? null : Number(s.diamond_weight_carats),
    })),

    goldColorOptions: row.variantOptions?.goldColors ?? [],
    purityOptions: row.variantOptions?.purities ?? [],
    diamondOptions: (row.variantOptions?.diamondOptions ?? []).map((d) => ({
      id: d.id,
      name: d.name,
      ratePerCent: Number(d.rate_per_carat),
    })),
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
    const { purity, diamondConfigId, sizeId } = variantPricePreviewQuerySchema.parse(req.query);
    const result = await productsService.previewProductVariantPricing(req.params.id, {
      purity,
      diamondConfigId,
      sizeId,
    });
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
