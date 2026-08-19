import { z } from 'zod';

export const simulateTrackingSchema = z.object({
  status: z.enum(['OUT_FOR_DELIVERY', 'DELIVERED']),
});

export const addTrackingEventSchema = z.object({
  status: z.string().trim().min(1).max(80),
  location: z.string().trim().max(120).optional(),
  note: z.string().trim().max(500).optional(),
});
