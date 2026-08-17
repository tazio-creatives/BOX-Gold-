import { query } from '../config/db.js';

export async function listRoles() {
  const { rows } = await query('SELECT * FROM admin_roles ORDER BY name');
  return rows;
}

export async function findRoleById(id) {
  const { rows } = await query('SELECT * FROM admin_roles WHERE id = $1', [id]);
  return rows[0] ?? null;
}
