import {
  createAdminUserSchema,
  updateAdminUserSchema,
  listAdminUsersQuerySchema,
} from '../validators/adminUsers.validators.js';
import * as adminUsersService from '../services/adminUsersService.js';
import { listAdminUsers } from '../repositories/adminUsers.repository.js';
import { listRoles } from '../repositories/adminRoles.repository.js';

function toAdminUserDto(row) {
  return {
    id: row.id,
    email: row.email,
    fullName: row.full_name,
    isActive: row.is_active,
    role: { id: row.role_id, name: row.role_name },
    createdAt: row.created_at,
  };
}

export async function list(req, res, next) {
  try {
    const q = listAdminUsersQuerySchema.parse(req.query);
    const page = q.page ?? 1;
    const limit = q.limit ?? 20;
    const { items, total } = await listAdminUsers({ page, limit });
    res.json({
      adminUsers: items.map(toAdminUserDto),
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    });
  } catch (err) {
    next(err);
  }
}

export async function roles(req, res, next) {
  try {
    const rows = await listRoles();
    res.json({ roles: rows.map((r) => ({ id: r.id, name: r.name, permissions: r.permissions })) });
  } catch (err) {
    next(err);
  }
}

export async function create(req, res, next) {
  try {
    const input = createAdminUserSchema.parse(req.body);
    const admin = await adminUsersService.createAdminUser(input);
    res.status(201).json({ adminUser: toAdminUserDto(admin) });
  } catch (err) {
    next(err);
  }
}

export async function update(req, res, next) {
  try {
    const input = updateAdminUserSchema.parse(req.body);
    const admin = await adminUsersService.updateAdminUser(req.params.id, req.admin.id, input);
    res.json({ adminUser: toAdminUserDto(admin) });
  } catch (err) {
    next(err);
  }
}
