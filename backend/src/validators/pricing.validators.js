import { z } from 'zod';

export const pricingPreviewSchema = z.object({
  metalType: z.enum(['GOLD', 'PLATINUM']),
  purity: z.enum(['9K', '14K', '18K', '22K', '24K']).nullable().optional(),
  goldWeightGrams: z.coerce.number().positive().nullable().optional(),
  diamondWeightCarats: z.coerce.number().nonnegative().nullable().optional(),
  diamondConfigId: z.string().uuid().nullable().optional(),
  makingCharge: z.coerce.number().nonnegative().optional(),
  gstPercent: z.coerce.number().nonnegative().optional(),
});

export const priceLockSchema = z.object({
  locked: z.boolean(),
});

export const goldRateSettingsSchema = z.object({
  source: z.enum(['AUTOMATIC', 'MANUAL']).optional(),
  adjustmentType: z.enum(['NONE', 'FIXED', 'PERCENTAGE']).optional(),
  adjustmentValue: z.coerce.number().optional(),
  maxDeviationPercent: z.coerce.number().positive().optional(),
});

export const manualGoldRateSchema = z.object({
  rate24k: z.coerce.number().positive(),
});
