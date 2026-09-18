import { z } from 'zod';
import { ADMIN_MANUAL_TARGETS, STATUS_FILTER_VALUES } from '../utils/orderStatus.js';

export const listOrdersQuerySchema = z.object({
  status: z.enum(STATUS_FILTER_VALUES).optional(),
  // Matches order number (what the work order's barcode encodes — a
  // scanner "typing" a scanned code into this field searches the same way
  // as pasting the order number in by hand) or contact mobile.
  search: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(50).optional(),
});

export const orderSummaryQuerySchema = z.object({
  status: z.enum(STATUS_FILTER_VALUES).optional(),
});

export const updateOrderStatusSchema = z.object({
  status: z.enum(ADMIN_MANUAL_TARGETS),
  note: z.string().trim().max(500).optional(),
});
