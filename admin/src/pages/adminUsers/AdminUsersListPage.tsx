import { useState, type FormEvent } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { fetchAdminUsers, fetchAdminRoles, createAdminUser, updateAdminUser } from '../../api/adminUsers';
import type { AdminRole, AdminUser, AdminUserInput } from '../../api/types';
import { useAdmin } from '../../features/auth/useAdmin';
import { ApiError } from '../../api/client';
import sharedStyles from '../../styles/shared.module.css';
import styles from './AdminUsersListPage.module.css';

type Mode = { type: 'none' } | { type: 'add' } | { type: 'edit'; adminUser: AdminUser };

function AdminUserForm({
  initial,
  roles,
  onSubmit,
  onCancel,
  isSelf,
}: {
  initial?: AdminUser;
  roles: AdminRole[];
  onSubmit: (input: AdminUserInput) => Promise<unknown>;
  onCancel: () => void;
  isSelf?: boolean;
}) {
  const [email, setEmail] = useState(initial?.email ?? '');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState(initial?.fullName ?? '');
  const [roleId, setRoleId] = useState(initial?.role.id ?? roles[0]?.id ?? '');
  const [isActive, setIsActive] = useState(initial?.isActive ?? true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      const input: AdminUserInput = initial
        ? { fullName, roleId, isActive, ...(password ? { password } : {}) }
        : { email, password, fullName, roleId };
      await onSubmit(input);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save admin user.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className={sharedStyles.cardPadded}>
      <div className={sharedStyles.formGrid2}>
        <label className={sharedStyles.field}>
          Email
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={!!initial}
            required
          />
        </label>
        <label className={sharedStyles.field}>
          Full Name
          <input value={fullName} onChange={(e) => setFullName(e.target.value)} required />
        </label>
        <label className={sharedStyles.field}>
          {initial ? 'New Password (optional)' : 'Password'}
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={10}
            required={!initial}
            placeholder={initial ? 'Leave blank to keep current' : 'At least 10 characters'}
          />
        </label>
        <label className={sharedStyles.field}>
          Role
          <select value={roleId} onChange={(e) => setRoleId(e.target.value)} required>
            {roles.map((role) => (
              <option key={role.id} value={role.id}>
                {role.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      {initial && (
        <label className={`${sharedStyles.field} ${sharedStyles.checkboxField} ${sharedStyles.formSection}`}>
          <input
            type="checkbox"
            checked={isActive}
            disabled={isSelf}
            onChange={(e) => setIsActive(e.target.checked)}
          />
          Active {isSelf && '(you cannot deactivate your own account)'}
        </label>
      )}
      {error && <p className={sharedStyles.error}>{error}</p>}
      <div className={sharedStyles.formActions}>
        <button type="submit" className={sharedStyles.buttonPrimary} disabled={isSubmitting}>
          {isSubmitting ? 'Saving…' : 'Save'}
        </button>
        <button type="button" className={sharedStyles.button} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}

export function AdminUsersListPage() {
  const queryClient = useQueryClient();
  const { admin: currentAdmin } = useAdmin();
  const { data, isLoading } = useQuery({ queryKey: ['admin-users'], queryFn: () => fetchAdminUsers() });
  const { data: rolesData } = useQuery({ queryKey: ['admin-roles'], queryFn: fetchAdminRoles });
  const [mode, setMode] = useState<Mode>({ type: 'none' });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['admin-users'] });

  const createMutation = useMutation({
    mutationFn: (input: AdminUserInput) => createAdminUser(input),
    onSuccess: () => {
      invalidate();
      setMode({ type: 'none' });
    },
  });
  const updateMutation = useMutation({
    mutationFn: ({ id, input }: { id: string; input: AdminUserInput }) => updateAdminUser(id, input),
    onSuccess: () => {
      invalidate();
      setMode({ type: 'none' });
    },
    onError: (err) => window.alert(err instanceof ApiError ? err.message : 'Could not update admin user.'),
  });

  if (isLoading) return <p>Loading…</p>;
  const adminUsers = data?.adminUsers ?? [];
  const roles = rolesData?.roles ?? [];

  return (
    <div>
      <div className={sharedStyles.pageHeader}>
        <h1 className={sharedStyles.pageTitle}>Admin Users</h1>
        {mode.type === 'none' && roles.length > 0 && (
          <button type="button" className={sharedStyles.buttonPrimary} onClick={() => setMode({ type: 'add' })}>
            Add Admin User
          </button>
        )}
      </div>

      {mode.type === 'add' && (
        <div className={styles.formWrapper}>
          <AdminUserForm
            roles={roles}
            onSubmit={(input) => createMutation.mutateAsync(input)}
            onCancel={() => setMode({ type: 'none' })}
          />
        </div>
      )}
      {mode.type === 'edit' && (
        <div className={styles.formWrapper}>
          <AdminUserForm
            initial={mode.adminUser}
            roles={roles}
            isSelf={mode.adminUser.id === currentAdmin?.id}
            onSubmit={(input) => updateMutation.mutateAsync({ id: mode.adminUser.id, input })}
            onCancel={() => setMode({ type: 'none' })}
          />
        </div>
      )}

      <div className={sharedStyles.card}>
        {adminUsers.length === 0 && <p className={sharedStyles.empty}>No admin users yet.</p>}
        {adminUsers.length > 0 && (
          <table className={sharedStyles.table}>
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {adminUsers.map((adminUser) => (
                <tr key={adminUser.id}>
                  <td>
                    {adminUser.fullName}
                    {adminUser.id === currentAdmin?.id && <span className={styles.youBadge}>you</span>}
                  </td>
                  <td>{adminUser.email}</td>
                  <td>{adminUser.role.name}</td>
                  <td>
                    <span className={adminUser.isActive ? sharedStyles.badgeSuccess : sharedStyles.badgeNeutral}>
                      {adminUser.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td>
                    <button
                      type="button"
                      className={sharedStyles.buttonLink}
                      onClick={() => setMode({ type: 'edit', adminUser })}
                    >
                      Edit
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
