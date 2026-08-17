import bcrypt from 'bcrypt';
import {
  insertAdminUser,
  updateAdminUser as updateAdminUserRow,
  findAdminById,
  findAdminByEmail,
} from '../repositories/adminUsers.repository.js';
import { findRoleById } from '../repositories/adminRoles.repository.js';
import { AppError, NotFoundError } from '../utils/AppError.js';

const BCRYPT_ROUNDS = 12;

export async function createAdminUser({ email, password, fullName, roleId }) {
  const existing = await findAdminByEmail(email);
  if (existing) throw new AppError(409, 'An admin with this email already exists');

  const role = await findRoleById(roleId);
  if (!role) throw new AppError(400, 'Unknown role');

  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  return insertAdminUser({ email, passwordHash, fullName, roleId });
}

// actingAdminId: the admin making the request — an admin can never
// deactivate or demote their own account (plan §8 SEC concern: prevents a
// single mistaken/self-serving request from locking every admin out).
export async function updateAdminUser(id, actingAdminId, { fullName, roleId, isActive, password }) {
  const existing = await findAdminById(id);
  if (!existing) throw new NotFoundError('Admin user not found');

  if (id === actingAdminId && isActive === false) {
    throw new AppError(400, 'You cannot deactivate your own account');
  }

  const fields = {};
  if (fullName !== undefined) fields.fullName = fullName;
  if (isActive !== undefined) fields.isActive = isActive;
  if (roleId !== undefined) {
    const role = await findRoleById(roleId);
    if (!role) throw new AppError(400, 'Unknown role');
    fields.roleId = roleId;
  }
  if (password) {
    fields.passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  }

  return updateAdminUserRow(id, fields);
}
