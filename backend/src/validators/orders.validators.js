import { z } from 'zod';

export const STATUSES = [
  'PENDING_PAYMENT',
  'CONFIRMED',
  'PROCESSING',
  'SHIPPED',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
  'PAYMENT_FAILED',
  'EXPIRED',
  'CANCELLED',
  'RETURN_REQUESTED',
  'REFUNDED',
];

export const listOrdersQuerySchema = z.object({
  status: z.enum(STATUSES).optional(),
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(50).optional(),
});

export const updateOrderStatusSchema = z.object({
  status: z.enum(STATUSES),
  note: z.string().trim().max(500).optional(),
});
