import { z } from 'zod';

export const createAdminUserSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(10).max(200),
  fullName: z.string().trim().min(1).max(200),
  roleId: z.string().uuid(),
});

export const updateAdminUserSchema = z.object({
  fullName: z.string().trim().min(1).max(200).optional(),
  roleId: z.string().uuid().optional(),
  isActive: z.boolean().optional(),
  password: z.string().min(10).max(200).optional(),
});

export const listAdminUsersQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
});
