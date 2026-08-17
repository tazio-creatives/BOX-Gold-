import { z } from 'zod';

export const createReviewSchema = z.object({
  rating: z.coerce.number().int().min(1).max(5),
  title: z.string().trim().max(200).nullable().optional(),
  body: z.string().trim().max(5000).nullable().optional(),
  orderItemId: z.string().uuid(),
});

export const listReviewsQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(50).optional(),
});

export const listModerationQuerySchema = listReviewsQuerySchema.extend({
  status: z.enum(['PENDING', 'APPROVED', 'REJECTED']).optional(),
});
