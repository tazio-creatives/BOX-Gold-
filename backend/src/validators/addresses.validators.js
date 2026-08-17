import { z } from 'zod';

export const createAddressSchema = z.object({
  type: z.enum(['HOME', 'OFFICE', 'OTHER']).optional(),
  isDefault: z.boolean().optional(),
  name: z.string().trim().min(1).max(200),
  mobileNumber: z.string().trim().min(6).max(20),
  addressLine: z.string().trim().min(1).max(500),
  building: z.string().trim().max(200).nullable().optional(),
  landmark: z.string().trim().max(200).nullable().optional(),
  city: z.string().trim().min(1).max(100),
  state: z.string().trim().min(1).max(100),
  pincode: z.string().trim().min(4).max(12),
  country: z.string().trim().min(1).max(100).optional(),
});

export const updateAddressSchema = createAddressSchema.partial();
