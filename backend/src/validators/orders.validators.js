import { z } from 'zod';

const STATUSES = [
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
