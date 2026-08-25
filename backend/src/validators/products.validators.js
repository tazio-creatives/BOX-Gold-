import { z } from 'zod';

const METAL_TYPES = ['GOLD', 'PLATINUM'];
const PURITIES = ['9K', '14K', '18K', '22K', '24K'];
const GOLD_COLORS = ['YELLOW', 'ROSE', 'WHITE'];
const STATUSES = ['DRAFT', 'AI_PROCESSING', 'AI_READY', 'PUBLISHED', 'FAILED'];

export const listProductsQuerySchema = z.object({
  category: z.string().trim().optional(),
  collection: z.string().trim().optional(),
  metal: z.enum(METAL_TYPES).optional(),
  purity: z.enum(PURITIES).optional(),
  goldColor: z.enum(GOLD_COLORS).optional(),
  priceMin: z.coerce.number().nonnegative().optional(),
  priceMax: z.coerce.number().nonnegative().optional(),
  sort: z.enum(['featured', 'newest', 'price_asc', 'price_desc']).optional(),
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
});

export const adminListProductsQuerySchema = listProductsQuerySchema.extend({
  status: z.enum(STATUSES).optional(),
});

export const createProductSchema = z.object({
  name: z.string().trim().min(1).max(300),
  sku: z.string().trim().min(1).max(100),
  categoryId: z.string().uuid().nullable().optional(),
  collectionId: z.string().uuid().nullable().optional(),
  shortDescription: z.string().trim().max(500).nullable().optional(),
  fullDescription: z.string().trim().max(10000).nullable().optional(),

  metalType: z.enum(METAL_TYPES),
  purity: z.enum(PURITIES).nullable().optional(),
  goldColor: z.enum(GOLD_COLORS).nullable().optional(),
  goldWeightGrams: z.coerce.number().positive().nullable().optional(),
  diamondWeightGrams: z.coerce.number().nonnegative().nullable().optional(),
  diamondWeightCarats: z.coerce.number().nonnegative().nullable().optional(),
  diamondConfigId: z.string().uuid().nullable().optional(),
  diamondCount: z.coerce.number().int().nonnegative().nullable().optional(),
  diamondType: z.string().trim().max(100).nullable().optional(),
  diamondColour: z.string().trim().max(50).nullable().optional(),
  diamondClarity: z.string().trim().max(50).nullable().optional(),
  gemstone: z.string().trim().max(100).nullable().optional(),
  certification: z.string().trim().max(200).nullable().optional(),
  productSize: z.string().trim().max(100).nullable().optional(),
  careInstructions: z.string().trim().max(2000).nullable().optional(),

  goldValue: z.coerce.number().nonnegative().optional(),
  diamondValue: z.coerce.number().nonnegative().optional(),
  diamondValueIsManual: z.boolean().optional(),
  makingCharge: z.coerce.number().nonnegative().optional(),
  gstPercent: z.coerce.number().nonnegative().optional(),
  mrp: z.coerce.number().nonnegative().optional(),
  sellingPrice: z.coerce.number().nonnegative().optional(),
  makingChargeDiscountPercent: z.coerce.number().min(0).max(100).optional(),
  diamondDiscountPercent: z.coerce.number().min(0).max(100).optional(),

  stockQuantity: z.coerce.number().int().nonnegative().optional(),
  status: z.enum(STATUSES).optional(),
  isFeatured: z.boolean().optional(),
  showDeliveryChecker: z.boolean().optional(),

  slug: z.string().trim().min(1).max(300).optional(),
  metaTitle: z.string().trim().max(300).nullable().optional(),
  metaDescription: z.string().trim().max(500).nullable().optional(),
  metaKeywords: z.string().trim().max(500).nullable().optional(),

  sizes: z
    .array(
      z.object({
        label: z.string().trim().min(1).max(50),
        stockQuantity: z.coerce.number().int().nonnegative(),
        weightGrams: z.coerce.number().positive().nullable().optional(),
        diamondWeightCarats: z.coerce.number().nonnegative().nullable().optional(),
      }),
    )
    .optional(),

  goldColors: z.array(z.enum(GOLD_COLORS)).optional(),
  purities: z.array(z.enum(PURITIES)).optional(),
  diamondConfigIds: z.array(z.string().uuid()).optional(),
});

export const updateProductSchema = createProductSchema.partial();

export const featuredSchema = z.object({
  featured: z.boolean(),
});

export const variantPricePreviewQuerySchema = z.object({
  purity: z.enum(PURITIES).optional(),
  diamondConfigId: z.string().uuid().optional(),
  sizeId: z.string().uuid().optional(),
});
