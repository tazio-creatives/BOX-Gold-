import { z } from 'zod';

export const createDiamondConfigSchema = z.object({
  name: z.string().trim().min(1),
  ratePerCent: z.coerce.number().positive(),
  isActive: z.boolean().optional(),
});

export const updateDiamondConfigSchema = createDiamondConfigSchema.partial();
