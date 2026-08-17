import { useRef, useState } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import {
  fetchProductImages,
  uploadProductImage,
  setPrimaryImage,
  reorderImages,
  deleteProductImage,
  type ImageGroup,
} from '../../api/productImages';
import { fetchAiImageStatus, regenerateAiImages, approveAiImage, rejectAiImage } from '../../api/aiImages';
import { ApiError } from '../../api/client';
import sharedStyles from '../../styles/shared.module.css';
import styles from './ProductGallery.module.css';

function thumbUrl(group: ImageGroup): string | null {
  const preferred = group.variants.find((v) => v.variant === 'small' && v.format === 'webp');
  return preferred?.url ?? group.variants[0]?.url ?? null;
}

export function ProductGallery({ productId }: { productId: string }) {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const { data: imagesData, isLoading: isImagesLoading } = useQuery({
    queryKey: ['admin-product-images', productId],
    queryFn: () => fetchProductImages(productId),
  });

  const { data: jobData } = useQuery({
    queryKey: ['admin-ai-images', productId],
    queryFn: () => fetchAiImageStatus(productId),
    refetchInterval: (query) => {
      const status = query.state.data?.job?.status;
      return status === 'PENDING' || status === 'PROCESSING' ? 2000 : false;
    },
  });

  const invalidateImages = () => queryClient.invalidateQueries({ queryKey: ['admin-product-images', productId] });
  const invalidateJob = () => queryClient.invalidateQueries({ queryKey: ['admin-ai-images', productId] });

  const uploadMutation = useMutation({
    mutationFn: (file: File) => uploadProductImage(productId, file),
    onSuccess: () => {
      invalidateImages();
      invalidateJob();
      setUploadError(null);
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

  const regenerateMutation = useMutation({
    mutationFn: () => regenerateAiImages(productId),
    onSuccess: invalidateJob,
    onError: (err) => window.alert(err instanceof ApiError ? err.message : 'Could not regenerate.'),
  });

  const approveMutation = useMutation({
    mutationFn: (imageId: string) => approveAiImage(productId, imageId),
    onSuccess: () => {
      invalidateImages();
      invalidateJob();
    },
  });

  const rejectMutation = useMutation({
    mutationFn: (imageId: string) => rejectAiImage(productId, imageId),
    onSuccess: invalidateJob,
  });

  function move(groups: ImageGroup[], index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= groups.length) return;
    const order = groups.map((g) => g.sortOrder);
    [order[index], order[target]] = [order[target], order[index]];
    reorderMutation.mutate(order);
  }

  const groups = imagesData?.images ?? [];
  const job = jobData?.job ?? null;
  const pendingCandidates = job?.candidates.filter((c) => !c.approved) ?? [];

  return (
    <div>
      <div className={styles.uploadRow}>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) uploadMutation.mutate(file);
            e.target.value = '';
          }}
          hidden
        />
        <button
          type="button"
          className={sharedStyles.button}
          disabled={uploadMutation.isPending}
          onClick={() => fileInputRef.current?.click()}
        >
          {uploadMutation.isPending ? 'Uploading…' : 'Upload Photo'}
        </button>
        {groups.some((g) => g.type === 'ORIGINAL') && (
          <button
            type="button"
            className={sharedStyles.button}
            disabled={regenerateMutation.isPending}
            onClick={() => regenerateMutation.mutate()}
          >
            {regenerateMutation.isPending ? 'Requesting…' : 'Regenerate AI Variants'}
          </button>
        )}
      </div>
      {uploadError && <p className={sharedStyles.error}>{uploadError}</p>}

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
                </div>
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

      {job && (job.status === 'PENDING' || job.status === 'PROCESSING') && (
        <p className={styles.jobStatus}>Generating AI variants…</p>
      )}
      {job && job.status === 'FAILED' && <p className={sharedStyles.error}>AI generation failed: {job.error}</p>}

      {pendingCandidates.length > 0 && (
        <div className={styles.candidatesSection}>
          <h3 className={styles.candidatesHeading}>AI-Generated Candidates — Review</h3>
          <div className={styles.grid}>
            {pendingCandidates.map((candidate) => (
              <div key={candidate.id} className={styles.card}>
                <div className={styles.thumbWrapper}>
                  <img src={candidate.imageUrl} alt="" className={styles.thumb} />
                </div>
                <div className={styles.cardActions}>
                  <button type="button" onClick={() => approveMutation.mutate(candidate.id)}>
                    Approve
                  </button>
                  <button type="button" onClick={() => rejectMutation.mutate(candidate.id)}>
                    Reject
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
