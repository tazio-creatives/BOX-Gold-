import { z } from 'zod';

// Matches the 12 section types the storefront renderer understands
// (plan §3 homepage structure) — free text at the DB level, enforced here.
const SECTION_TYPES = [
  'HERO',
  'BENTO_CATEGORIES',
  'NEW_ARRIVALS',
  'COLLECTION_CARDS',
  'SHOP_BY_MATERIAL',
  'FEATURED_PRODUCT',
  'BEST_SELLERS',
  'SHOP_BY_PRICE',
  'OCCASION_CARDS',
  'INSTAGRAM',
  'NEWSLETTER',
  'TRUST_STRIP',
  'CAMPAIGN_BANNERS',
  'CATEGORY_PRODUCTS',
];

export const createSectionSchema = z.object({
  type: z.enum(SECTION_TYPES),
  heading: z.string().trim().max(200).nullable().optional(),
  isEnabled: z.boolean().optional(),
});

export const updateSectionSchema = z.object({
  heading: z.string().trim().max(200).nullable().optional(),
  isEnabled: z.boolean().optional(),
});

export const reorderSchema = z.object({
  order: z.array(z.number().int()).min(1),
});

export const createItemSchema = z.object({
  imageUrl: z.string().trim().max(500).nullable().optional(),
  imageUrlMobile: z.string().trim().max(500).nullable().optional(),
  heading: z.string().trim().max(200).nullable().optional(),
  subheading: z.string().trim().max(400).nullable().optional(),
  ctaLabel: z.string().trim().max(100).nullable().optional(),
  ctaUrl: z.string().trim().max(500).nullable().optional(),
  categoryId: z.string().uuid().nullable().optional(),
  collectionId: z.string().uuid().nullable().optional(),
  productId: z.string().uuid().nullable().optional(),
});

export const updateItemSchema = createItemSchema.partial();
