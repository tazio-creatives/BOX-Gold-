import { useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import type { Category } from '../../api/types';
import { ApiError } from '../../api/client';
import { uploadCategoryImage } from '../../api/categories';
import sharedStyles from '../../styles/shared.module.css';

interface CategoryFormProps {
  initial?: Category;
  categories: Category[];
  defaultParentId?: string | null;
  onSubmit: (input: Partial<Category>) => Promise<unknown>;
  onCancel: () => void;
}

export function CategoryForm({ initial, categories, defaultParentId, onSubmit, onCancel }: CategoryFormProps) {
  const [name, setName] = useState(initial?.name ?? '');
  const [slug, setSlug] = useState(initial?.slug ?? '');
  const [parentId, setParentId] = useState<string>(initial?.parentId ?? defaultParentId ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [imageUrl, setImageUrl] = useState(initial?.imageUrl ?? '');
  const [isActive, setIsActive] = useState(initial?.isActive ?? true);
  const [sortOrder, setSortOrder] = useState(initial?.sortOrder ?? 0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setIsUploading(true);
    try {
      const { url } = await uploadCategoryImage(file);
      setImageUrl(url);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not upload image.');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      await onSubmit({
        name,
        slug: slug || undefined,
        parentId: parentId || null,
        description: description || null,
        imageUrl: imageUrl || null,
        isActive,
        sortOrder,
      });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save category.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className={sharedStyles.cardPadded}>
      <div className={sharedStyles.formGrid}>
        <label className={sharedStyles.field}>
          Name
          <input value={name} onChange={(e) => setName(e.target.value)} required />
        </label>
        <label className={sharedStyles.field}>
          Slug (optional)
          <input value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="auto from name" />
        </label>
        <label className={sharedStyles.field}>
          Parent Category
          <select value={parentId} onChange={(e) => setParentId(e.target.value)}>
            <option value="">— None (top-level) —</option>
            {categories
              .filter((c) => c.id !== initial?.id)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
          </select>
        </label>
      </div>

      <div className={`${sharedStyles.formGrid} ${sharedStyles.formSection}`}>
        <label className={sharedStyles.field}>
          Sort Order
          <input type="number" value={sortOrder} onChange={(e) => setSortOrder(Number(e.target.value))} />
        </label>
        <label className={`${sharedStyles.field} ${sharedStyles.checkboxField}`}>
          <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
          Active
        </label>
      </div>

      <label className={`${sharedStyles.field} ${sharedStyles.formSection}`}>
        Description
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
      </label>

      <div className={`${sharedStyles.field} ${sharedStyles.formSection}`}>
        Category image (optional)
        {imageUrl && (
          <img
            src={imageUrl}
            alt=""
            style={{ maxWidth: 240, maxHeight: 140, objectFit: 'cover', display: 'block', margin: '4px 0 8px' }}
          />
        )}
        <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileChange} disabled={isUploading} />
        {isUploading && <p>Uploading…</p>}
        <input
          value={imageUrl}
          onChange={(e) => setImageUrl(e.target.value)}
          placeholder="…or paste an image URL directly"
          style={{ marginTop: 6 }}
        />
      </div>

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
