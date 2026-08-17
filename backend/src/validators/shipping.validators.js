import { z } from 'zod';

export const simulateTrackingSchema = z.object({
  status: z.enum(['OUT_FOR_DELIVERY', 'DELIVERED']),
});
