import { apiFetch } from './client';
import type { AdminRole, AdminUser, AdminUserInput } from './types';

export interface AdminUserListResponse {
  adminUsers: AdminUser[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export function fetchAdminUsers(page = 1, limit = 20) {
  return apiFetch<AdminUserListResponse>(`/admin/admin-users?page=${page}&limit=${limit}`);
}

export function fetchAdminRoles() {
  return apiFetch<{ roles: AdminRole[] }>('/admin/admin-users/roles');
}

export function createAdminUser(input: AdminUserInput) {
  return apiFetch<{ adminUser: AdminUser }>('/admin/admin-users', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function updateAdminUser(id: string, input: AdminUserInput) {
  return apiFetch<{ adminUser: AdminUser }>(`/admin/admin-users/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}
