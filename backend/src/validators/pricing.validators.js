import { z } from 'zod';

export const pricingPreviewSchema = z.object({
  metalType: z.enum(['GOLD', 'PLATINUM']),
  purity: z.enum(['14K', '18K', '22K', '24K']).nullable().optional(),
  netWeightGrams: z.coerce.number().positive().nullable().optional(),
  diamondWeightCarats: z.coerce.number().nonnegative().nullable().optional(),
  diamondConfigId: z.string().uuid().nullable().optional(),
  makingCharge: z.coerce.number().nonnegative().optional(),
  gstPercent: z.coerce.number().nonnegative().optional(),
});

export const priceLockSchema = z.object({
  locked: z.boolean(),
});
