import { z } from 'zod';

const PURITIES = ['9K', '14K', '18K', '22K', '24K'];
const GOLD_COLORS = ['YELLOW', 'ROSE', 'WHITE'];

export const addCartItemSchema = z.object({
  productId: z.string().uuid(),
  quantity: z.coerce.number().int().positive().max(20).default(1),
  sizeId: z.string().uuid().optional(),
  goldColor: z.enum(GOLD_COLORS).optional(),
  purity: z.enum(PURITIES).optional(),
  diamondConfigId: z.string().uuid().optional(),
});

// Identifies one cart line for PATCH/DELETE — every selected axis, not just
// size, since two lines of the same product can differ by any of them.
export const cartItemVariantQuerySchema = z.object({
  sizeId: z.string().uuid().optional(),
  goldColor: z.enum(GOLD_COLORS).optional(),
  purity: z.enum(PURITIES).optional(),
  diamondConfigId: z.string().uuid().optional(),
});

export const updateCartItemSchema = z.object({
  quantity: z.coerce.number().int().min(0).max(20),
});
