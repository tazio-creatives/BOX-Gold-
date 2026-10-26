import { z } from 'zod';

// q is matched as plain text (normalised server-side, never interpolated
// into SQL). page/limit bound the work a single request can ask for.
export const searchQuerySchema = z.object({
  q: z.string().trim().min(1).max(100),
  page: z.coerce.number().int().min(1).max(100).default(1),
  limit: z.coerce.number().int().min(1).max(48).default(8),
});
