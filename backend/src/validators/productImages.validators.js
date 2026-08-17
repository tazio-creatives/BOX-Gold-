import { z } from 'zod';

export const reorderImagesSchema = z.object({
  // Full sequence of the product's current sort_order values, in the new
  // desired order.
  order: z.array(z.number().int()).min(1),
});
