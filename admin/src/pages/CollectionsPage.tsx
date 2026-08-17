import { useState, type FormEvent } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import {
  fetchAdminCollections,
  createCollection,
  updateCollection,
  deleteCollection,
} from '../api/collections';
import type { Collection } from '../api/types';
import { ApiError } from '../api/client';
import sharedStyles from '../styles/shared.module.css';
import styles from './CategoriesPage.module.css';

type Mode = { type: 'none' } | { type: 'add' } | { type: 'edit'; collection: Collection };

function CollectionForm({
  initial,
  onSubmit,
  onCancel,
}: {
  initial?: Collection;
  onSubmit: (input: Partial<Collection>) => Promise<unknown>;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [slug, setSlug] = useState(initial?.slug ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [isActive, setIsActive] = useState(initial?.isActive ?? true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      await onSubmit({ name, slug: slug || undefined, description: description || null, isActive });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save collection.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className={sharedStyles.cardPadded}>
      <div className={sharedStyles.formGrid2}>
        <label className={sharedStyles.field}>
          Name
          <input value={name} onChange={(e) => setName(e.target.value)} required />
        </label>
        <label className={sharedStyles.field}>
          Slug (optional)
          <input value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="auto from name" />
        </label>
      </div>
      <label className={`${sharedStyles.field} ${sharedStyles.formSection}`}>
        Description
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
      </label>
      <label className={`${sharedStyles.field} ${sharedStyles.checkboxField} ${sharedStyles.formSection}`}>
        <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
        Active
      </label>
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

export function CollectionsPage() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['admin-collections'], queryFn: fetchAdminCollections });
  const [mode, setMode] = useState<Mode>({ type: 'none' });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['admin-collections'] });

  const createMutation = useMutation({
    mutationFn: (input: Partial<Collection>) => createCollection(input),
    onSuccess: () => {
      invalidate();
      setMode({ type: 'none' });
    },
  });
  const updateMutation = useMutation({
    mutationFn: ({ id, input }: { id: string; input: Partial<Collection> }) => updateCollection(id, input),
    onSuccess: () => {
      invalidate();
      setMode({ type: 'none' });
    },
  });
  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteCollection(id),
    onSuccess: invalidate,
    onError: (err) => window.alert(err instanceof Error ? err.message : 'Could not delete collection.'),
  });

  if (isLoading) return <p>Loading…</p>;
  const collections = data?.collections ?? [];

  return (
    <div>
      <div className={sharedStyles.pageHeader}>
        <h1 className={sharedStyles.pageTitle}>Collections</h1>
        {mode.type === 'none' && (
          <button type="button" className={sharedStyles.buttonPrimary} onClick={() => setMode({ type: 'add' })}>
            Add Collection
          </button>
        )}
      </div>

      {mode.type === 'add' && (
        <div className={styles.formWrapper}>
          <CollectionForm onSubmit={(input) => createMutation.mutateAsync(input)} onCancel={() => setMode({ type: 'none' })} />
        </div>
      )}
      {mode.type === 'edit' && (
        <div className={styles.formWrapper}>
          <CollectionForm
            initial={mode.collection}
            onSubmit={(input) => updateMutation.mutateAsync({ id: mode.collection.id, input })}
            onCancel={() => setMode({ type: 'none' })}
          />
        </div>
      )}

      <div className={sharedStyles.card}>
        {collections.length === 0 && <p className={sharedStyles.empty}>No collections yet.</p>}
        {collections.map((collection) => (
          <div key={collection.id} className={styles.row}>
            <span className={styles.name}>{collection.name}</span>
            <span className={styles.slug}>/{collection.slug}</span>
            <span className={collection.isActive ? sharedStyles.badgeSuccess : sharedStyles.badgeNeutral}>
              {collection.isActive ? 'Active' : 'Inactive'}
            </span>
            <div className={styles.actions}>
              <button type="button" className={sharedStyles.buttonLink} onClick={() => setMode({ type: 'edit', collection })}>
                Edit
              </button>
              <button
                type="button"
                className={sharedStyles.buttonLink}
                onClick={() => {
                  if (window.confirm(`Delete "${collection.name}"?`)) deleteMutation.mutate(collection.id);
                }}
              >
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
