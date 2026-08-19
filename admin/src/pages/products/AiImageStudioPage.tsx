import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createStudioJob,
  fetchStudioJob,
  confirmStudioJob,
  retryStudioAsset,
  importStudioJob,
  cancelStudioJob,
  type PresenterStyle,
  type JewelleryType,
} from '../../api/aiStudio';
import { fetchAdminCategories } from '../../api/categories';
import type { GoldColor } from '../../api/types';
import { ApiError } from '../../api/client';
import { StudioStepper } from '../../features/aiStudio/StudioStepper';
import { UploadStep } from '../../features/aiStudio/UploadStep';
import { AnalyseConfirmStep } from '../../features/aiStudio/AnalyseConfirmStep';
import { PresenterStep } from '../../features/aiStudio/PresenterStep';
import { GenerateStep } from '../../features/aiStudio/GenerateStep';
import { ReviewImportStep } from '../../features/aiStudio/ReviewImportStep';
import sharedStyles from '../../styles/shared.module.css';
import styles from './AiImageStudioPage.module.css';

export function AiImageStudioPage() {
  const { id: productId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [jobId, setJobId] = useState<string | null>(null);
  const [jewelleryType, setJewelleryType] = useState('');
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [metalColor, setMetalColor] = useState<GoldColor | ''>('');
  const [presenterStyle, setPresenterStyle] = useState<PresenterStyle | ''>('');
  const [retryingAssetId, setRetryingAssetId] = useState<string | null>(null);

  const { data: categoriesData } = useQuery({ queryKey: ['admin-categories'], queryFn: fetchAdminCategories });

  const jobQueryKey = ['ai-studio-job', productId, jobId];
  const { data: jobData } = useQuery({
    queryKey: jobQueryKey,
    queryFn: () => fetchStudioJob(productId as string, jobId as string),
    enabled: !!productId && !!jobId,
    refetchInterval: (query) => {
      const status = query.state.data?.job.status;
      return status === 'analysing' || status === 'generating' ? 2000 : false;
    },
  });
  const job = jobData?.job ?? null;
  const invalidateJob = () => queryClient.invalidateQueries({ queryKey: jobQueryKey });

  const createMutation = useMutation({
    mutationFn: (files: File[]) => createStudioJob(productId as string, files),
    onSuccess: (res) => setJobId(res.jobId),
  });

  const confirmMutation = useMutation({
    mutationFn: () =>
      confirmStudioJob(productId as string, jobId as string, {
        jewelleryType: jewelleryType as Exclude<JewelleryType, 'UNKNOWN'>,
        categoryId,
        metalColor: metalColor || null,
        presenterStyle: presenterStyle as PresenterStyle,
      }),
    onSuccess: invalidateJob,
  });

  const retryMutation = useMutation({
    mutationFn: (assetId: string) => {
      setRetryingAssetId(assetId);
      return retryStudioAsset(productId as string, jobId as string, assetId);
    },
    onSuccess: invalidateJob,
    onSettled: () => setRetryingAssetId(null),
  });

  const importMutation = useMutation({
    mutationFn: () => importStudioJob(productId as string, jobId as string),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-product-images', productId] });
      navigate(`/products/${productId}/edit`);
    },
  });

  const cancelMutation = useMutation({
    mutationFn: () => cancelStudioJob(productId as string, jobId as string),
    onSuccess: () => navigate(`/products/${productId}/edit`),
  });

  const createError = createMutation.error instanceof ApiError ? createMutation.error.message : null;
  const confirmError = confirmMutation.error instanceof ApiError ? confirmMutation.error.message : null;

  const canConfirm = !!jewelleryType && !!presenterStyle;

  return (
    <div>
      <div className={styles.header}>
        <h1>AI Image Studio</h1>
        {job && !['completed', 'importing'].includes(job.status) && (
          <button type="button" className={sharedStyles.button} onClick={() => cancelMutation.mutate()}>
            Cancel
          </button>
        )}
      </div>
      <p className={styles.subtitle}>Upload a jewellery reference photo and generate a standard 4-image set.</p>

      <StudioStepper status={job?.status ?? null} />

      <section className={sharedStyles.cardPadded}>
        {!job && <UploadStep onSubmit={(files) => createMutation.mutate(files)} isPending={createMutation.isPending} error={createError} />}

        {job && job.status === 'analysing' && <p>Analysing the reference photo…</p>}

        {job && job.status === 'awaiting_confirmation' && (
          <>
            <AnalyseConfirmStep
              job={job}
              categories={categoriesData?.categories ?? []}
              jewelleryType={jewelleryType}
              onJewelleryTypeChange={setJewelleryType}
              categoryId={categoryId}
              onCategoryIdChange={setCategoryId}
              metalColor={metalColor}
              onMetalColorChange={setMetalColor}
            />
            <hr style={{ margin: 'var(--space-5) 0', border: 'none', borderTop: '1px solid var(--color-border)' }} />
            <PresenterStep value={presenterStyle} onChange={setPresenterStyle} />
            {confirmError && <p className={sharedStyles.error}>{confirmError}</p>}
            <div className={styles.actions}>
              <button
                type="button"
                className={sharedStyles.buttonPrimary}
                disabled={!canConfirm || confirmMutation.isPending}
                onClick={() => confirmMutation.mutate()}
              >
                {confirmMutation.isPending ? 'Starting…' : 'Generate 4 Images'}
              </button>
            </div>
          </>
        )}

        {job && job.status === 'generating' && <GenerateStep assets={job.assets} />}

        {job && ['review_ready', 'partially_failed'].includes(job.status) && (
          <ReviewImportStep
            assets={job.assets}
            onRetry={(assetId) => retryMutation.mutate(assetId)}
            retryingAssetId={retryingAssetId}
            onImport={() => importMutation.mutate()}
            isImporting={importMutation.isPending}
          />
        )}

        {job && job.status === 'importing' && <p>Importing images into the product…</p>}
        {job && job.status === 'failed' && <p className={sharedStyles.error}>Generation failed: {job.error}</p>}
        {job && job.status === 'cancelled' && <p>This job was cancelled.</p>}
      </section>
    </div>
  );
}
