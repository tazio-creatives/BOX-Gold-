import { z } from 'zod';

export const createCategorySchema = z.object({
  parentId: z.string().uuid().nullable().optional(),
  name: z.string().trim().min(1).max(200),
  slug: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  imageUrl: z.string().trim().max(500).nullable().optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

export const updateCategorySchema = createCategorySchema.partial();
