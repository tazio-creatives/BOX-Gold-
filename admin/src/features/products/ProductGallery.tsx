import { useRef, useState } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import {
  fetchProductImages,
  uploadProductImage,
  setPrimaryImage,
  reorderImages,
  deleteProductImage,
  attachExistingImage,
  updateImageLabels,
  type ImageGroup,
  type ImageGoldColour,
  type ImageLabels,
  type ImageShotType,
} from '../../api/productImages';
import { ApiError } from '../../api/client';
import { ImageLibraryPicker } from './ImageLibraryPicker';
import sharedStyles from '../../styles/shared.module.css';
import styles from './ProductGallery.module.css';

const COLOUR_LABELS: Record<ImageGoldColour, string> = {
  YELLOW: 'Yellow Gold',
  ROSE: 'Rose Gold',
  WHITE: 'White Gold',
  ANY: 'Colour-neutral',
};

const SHOT_LABELS: Record<ImageShotType, string> = {
  FRONT: 'Front',
  ANGLE: 'Angle / 45°',
  SIDE: 'Side',
  MACRO: 'Close-up',
  MODEL: 'Model / hand',
  SIZE_GUIDE: 'Size guide',
  OTHER: 'Other',
};
// Size guides are labelled automatically and can't be picked by hand.
const SELECTABLE_SHOTS: ImageShotType[] = ['FRONT', 'ANGLE', 'SIDE', 'MACRO', 'MODEL', 'OTHER'];
const ALL_COLOURS: ImageGoldColour[] = ['YELLOW', 'ROSE', 'WHITE', 'ANY'];

// A photo waiting for its gold-colour choice before it's actually added —
// only used for products sold in more than one colour.
type PendingAdd =
  | { kind: 'file'; file: File }
  | { kind: 'attach'; source: { sourceProductId: string; sourceSortOrder: number } };

function thumbUrl(group: ImageGroup): string | null {
  const preferred = group.variants.find((v) => v.variant === 'small' && v.format === 'webp');
  return preferred?.url ?? group.variants[0]?.url ?? null;
}

// Pure manual photo management (upload, reorder, set primary, delete) — no
// AI generation UI here. That lives in AiVariantsPanel, under the separate
// "Generate with AI" card, so the two flows never visually mix.
export function ProductGallery({ productId }: { productId: string }) {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isLibraryOpen, setIsLibraryOpen] = useState(false);
  const [pendingAdd, setPendingAdd] = useState<PendingAdd | null>(null);
  const [pendingColour, setPendingColour] = useState<ImageGoldColour | ''>('');
  const [pendingShot, setPendingShot] = useState<ImageShotType>('OTHER');

  const { data: imagesData, isLoading: isImagesLoading } = useQuery({
    queryKey: ['admin-product-images', productId],
    queryFn: () => fetchProductImages(productId),
  });

  const invalidateImages = () => queryClient.invalidateQueries({ queryKey: ['admin-product-images', productId] });

  const uploadMutation = useMutation({
    mutationFn: ({ file, labels }: { file: File; labels?: ImageLabels }) => uploadProductImage(productId, file, labels),
    onSuccess: () => {
      invalidateImages();
      setUploadError(null);
      setPendingAdd(null);
    },
    onError: (err) => setUploadError(err instanceof ApiError ? err.message : 'Upload failed.'),
  });

  const primaryMutation = useMutation({
    mutationFn: (sortOrder: number) => setPrimaryImage(productId, sortOrder),
    onSuccess: invalidateImages,
  });

  const deleteMutation = useMutation({
    mutationFn: (sortOrder: number) => deleteProductImage(productId, sortOrder),
    onSuccess: invalidateImages,
  });

  const reorderMutation = useMutation({
    mutationFn: (order: number[]) => reorderImages(productId, order),
    onSuccess: invalidateImages,
  });

  const attachMutation = useMutation({
    mutationFn: ({
      source,
      labels,
    }: {
      source: { sourceProductId: string; sourceSortOrder: number };
      labels?: ImageLabels;
    }) => attachExistingImage(productId, source, labels),
    onSuccess: () => {
      invalidateImages();
      setUploadError(null);
      setIsLibraryOpen(false);
      setPendingAdd(null);
    },
    onError: (err) => setUploadError(err instanceof ApiError ? err.message : 'Could not attach image.'),
  });

  const labelsMutation = useMutation({
    mutationFn: ({ sortOrder, labels }: { sortOrder: number; labels: ImageLabels }) =>
      updateImageLabels(productId, sortOrder, labels),
    onSuccess: invalidateImages,
    onError: (err) => setUploadError(err instanceof ApiError ? err.message : 'Could not update the photo label.'),
  });

  // Sold in more than one gold colour → every manually added photo needs an
  // explicit colour (or Colour-neutral) so the cart can show the right one.
  // Single-colour products keep the one-click upload.
  const offeredColours = imagesData?.offeredGoldColours ?? [];
  const needsColourChoice = offeredColours.length > 1;
  const colourOptions: ImageGoldColour[] = [...offeredColours, 'ANY'];

  function startPending(next: PendingAdd) {
    setPendingAdd(next);
    setPendingColour('');
    setPendingShot('OTHER');
    setUploadError(null);
  }

  function confirmPending() {
    if (!pendingAdd || !pendingColour) return;
    const labels: ImageLabels = { goldColour: pendingColour, shotType: pendingShot };
    if (pendingAdd.kind === 'file') uploadMutation.mutate({ file: pendingAdd.file, labels });
    else attachMutation.mutate({ source: pendingAdd.source, labels });
  }

  function move(groups: ImageGroup[], index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= groups.length) return;
    const order = groups.map((g) => g.sortOrder);
    [order[index], order[target]] = [order[target], order[index]];
    reorderMutation.mutate(order);
  }

  const groups = imagesData?.images ?? [];
  const isAdding = uploadMutation.isPending || attachMutation.isPending;

  return (
    <div>
      <div className={styles.uploadRow}>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) {
              if (needsColourChoice) startPending({ kind: 'file', file });
              else uploadMutation.mutate({ file });
            }
            e.target.value = '';
          }}
          hidden
        />
        <button
          type="button"
          className={sharedStyles.button}
          disabled={uploadMutation.isPending || !!pendingAdd}
          onClick={() => fileInputRef.current?.click()}
        >
          {uploadMutation.isPending ? 'Uploading…' : 'Upload Photo'}
        </button>
        <button
          type="button"
          className={sharedStyles.button}
          disabled={!!pendingAdd}
          onClick={() => setIsLibraryOpen(true)}
        >
          Choose Existing
        </button>
      </div>

      {pendingAdd && (
        <div className={styles.pendingPanel}>
          <p className={styles.pendingTitle}>
            {pendingAdd.kind === 'file' ? `New photo: ${pendingAdd.file.name}` : 'Existing photo'} — this product is
            sold in more than one gold colour. Which colour does this photo show?
          </p>
          <div className={styles.pendingFields}>
            <label className={sharedStyles.field}>
              Gold colour (required)
              <select value={pendingColour} onChange={(e) => setPendingColour(e.target.value as ImageGoldColour | '')}>
                <option value="">Select…</option>
                {colourOptions.map((c) => (
                  <option key={c} value={c}>
                    {COLOUR_LABELS[c]}
                  </option>
                ))}
              </select>
            </label>
            <label className={sharedStyles.field}>
              Shot type
              <select value={pendingShot} onChange={(e) => setPendingShot(e.target.value as ImageShotType)}>
                {SELECTABLE_SHOTS.map((t) => (
                  <option key={t} value={t}>
                    {SHOT_LABELS[t]}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className={styles.uploadRow}>
            <button
              type="button"
              className={sharedStyles.buttonPrimary}
              disabled={!pendingColour || isAdding}
              onClick={confirmPending}
            >
              {isAdding ? 'Adding…' : 'Add Photo'}
            </button>
            <button type="button" className={sharedStyles.button} disabled={isAdding} onClick={() => setPendingAdd(null)}>
              Cancel
            </button>
          </div>
        </div>
      )}
      {uploadError && <p className={sharedStyles.error}>{uploadError}</p>}

      {isLibraryOpen && (
        <ImageLibraryPicker
          excludeProductId={productId}
          isAttaching={attachMutation.isPending}
          onSelect={(source) => {
            if (needsColourChoice) {
              setIsLibraryOpen(false);
              startPending({ kind: 'attach', source });
            } else {
              attachMutation.mutate({ source });
            }
          }}
          onClose={() => setIsLibraryOpen(false)}
        />
      )}

      {isImagesLoading && <p className={sharedStyles.empty}>Loading gallery…</p>}

      {!isImagesLoading && groups.length === 0 && (
        <p className={sharedStyles.empty}>No photos yet — upload one to get started.</p>
      )}

      {groups.length > 0 && (
        <div className={styles.grid}>
          {groups.map((group, i) => {
            const url = thumbUrl(group);
            return (
              <div key={group.sortOrder} className={styles.card}>
                <div className={styles.thumbWrapper}>
                  {url ? <img src={url} alt="" className={styles.thumb} /> : <div className={styles.thumbEmpty} />}
                  {group.isPrimary && <span className={styles.primaryBadge}>Primary</span>}
                  <span className={styles.typeBadge}>{group.type === 'AI_GENERATED' ? 'AI' : 'Photo'}</span>
                  <span className={styles.colourBadge}>
                    {COLOUR_LABELS[group.goldColour]} · {SHOT_LABELS[group.shotType]}
                  </span>
                </div>
                {group.type !== 'PRODUCT_SIZE' && (
                  <div className={styles.labelFields}>
                    <select
                      aria-label="Gold colour"
                      value={group.goldColour}
                      disabled={labelsMutation.isPending}
                      onChange={(e) =>
                        labelsMutation.mutate({
                          sortOrder: group.sortOrder,
                          labels: { goldColour: e.target.value as ImageGoldColour, shotType: group.shotType },
                        })
                      }
                    >
                      {ALL_COLOURS.map((c) => (
                        <option key={c} value={c}>
                          {COLOUR_LABELS[c]}
                        </option>
                      ))}
                    </select>
                    <select
                      aria-label="Shot type"
                      value={group.shotType}
                      disabled={labelsMutation.isPending}
                      onChange={(e) =>
                        labelsMutation.mutate({
                          sortOrder: group.sortOrder,
                          labels: { goldColour: group.goldColour, shotType: e.target.value as ImageShotType },
                        })
                      }
                    >
                      {SELECTABLE_SHOTS.map((t) => (
                        <option key={t} value={t}>
                          {SHOT_LABELS[t]}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                <div className={styles.cardActions}>
                  <button type="button" onClick={() => move(groups, i, -1)} disabled={i === 0} aria-label="Move left">
                    ←
                  </button>
                  <button
                    type="button"
                    onClick={() => move(groups, i, 1)}
                    disabled={i === groups.length - 1}
                    aria-label="Move right"
                  >
                    →
                  </button>
                  {!group.isPrimary && (
                    <button type="button" onClick={() => primaryMutation.mutate(group.sortOrder)}>
                      Set Primary
                    </button>
                  )}
                  <button type="button" onClick={() => deleteMutation.mutate(group.sortOrder)}>
                    Delete
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
