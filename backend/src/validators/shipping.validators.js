import { z } from 'zod';

// Admin-entered at Create Shipment time — no product-catalog weight/
// dimension fields exist, so the courier needs these confirmed per shipment
// instead.
export const createShipmentSchema = z.object({
  weightGrams: z.coerce.number().positive().max(50000),
  lengthCm: z.coerce.number().positive().max(200),
  widthCm: z.coerce.number().positive().max(200),
  heightCm: z.coerce.number().positive().max(200),
});

export const simulateTrackingSchema = z.object({
  status: z.enum(['OUT_FOR_DELIVERY', 'DELIVERED']),
});

export const addTrackingEventSchema = z.object({
  status: z.string().trim().min(1).max(80),
  location: z.string().trim().max(120).optional(),
  note: z.string().trim().max(500).optional(),
});
