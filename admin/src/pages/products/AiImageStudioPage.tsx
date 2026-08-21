import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createStudioJob,
  fetchActiveStudioJob,
  fetchStudioJob,
  confirmStudioJob,
  retryStudioAsset,
  updateStudioAssetSelection,
  importStudioAsset,
  completeStudioImport,
  cancelStudioJob,
  type JewelleryType,
} from '../../api/aiStudio';
import { fetchAdminCategories } from '../../api/categories';
import { fetchAdminProduct } from '../../api/products';
import { ApiError } from '../../api/client';
import { StudioStepper } from '../../features/aiStudio/StudioStepper';
import { UploadStep } from '../../features/aiStudio/UploadStep';
import { AnalyseConfirmStep } from '../../features/aiStudio/AnalyseConfirmStep';
import { PresenterStep } from '../../features/aiStudio/PresenterStep';
import { GenerateStep } from '../../features/aiStudio/GenerateStep';
import { ReviewImportStep } from '../../features/aiStudio/ReviewImportStep';
import { resolveAssetTypesForJob, inferJewelleryTypeFromCategory } from '../../features/aiStudio/generationRules';
import sharedStyles from '../../styles/shared.module.css';
import styles from './AiImageStudioPage.module.css';

// The admin's last Rose Gold choice, remembered as a device-local default
// for the next product (spec: "use it as the default for the next product,
// the administrator must still be able to change it for each product").
const ROSE_GOLD_PREF_KEY = 'aiStudio.defaultGenerateRoseGold';

export function AiImageStudioPage() {
  const { id: productId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [jobId, setJobId] = useState<string | null>(null);
  const [hasCheckedActiveJob, setHasCheckedActiveJob] = useState(false);
  const [confirmSubStep, setConfirmSubStep] = useState<'analyse' | 'presenter'>('analyse');
  const [jewelleryType, setJewelleryType] = useState<JewelleryType | ''>('');
  const [generateRoseGold, setGenerateRoseGold] = useState(
    () => localStorage.getItem(ROSE_GOLD_PREF_KEY) !== 'false',
  );
  const [presenterId, setPresenterId] = useState<string | null>(null);
  const [regeneratingAssetId, setRegeneratingAssetId] = useState<string | null>(null);

  const { data: productData } = useQuery({
    queryKey: ['admin-product', productId],
    queryFn: () => fetchAdminProduct(productId as string),
    enabled: !!productId,
  });
  const { data: categoriesData } = useQuery({ queryKey: ['admin-categories'], queryFn: fetchAdminCategories });
  const product = productData?.product ?? null;
  const productCategory = categoriesData?.categories.find((c) => c.id === product?.categoryId) ?? null;

  // Resume an in-progress job for this product instead of always starting at
  // Upload — runs once on mount.
  useEffect(() => {
    if (!productId || hasCheckedActiveJob) return;
    fetchActiveStudioJob(productId)
      .then((res) => {
        if (res.jobId) setJobId(res.jobId);
      })
      .finally(() => setHasCheckedActiveJob(true));
  }, [productId, hasCheckedActiveJob]);

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

  // Once analysis lands, default the jewellery type used for generation to
  // whatever the product's own category implies — "Use Product Information"
  // is the default path, "Update Product Category" is the only way to
  // change it, and neither ever writes back to the product record itself.
  useEffect(() => {
    if (!job?.analysis || jewelleryType) return;
    const inferred = inferJewelleryTypeFromCategory(productCategory?.name ?? null);
    if (inferred) {
      setJewelleryType(inferred);
    } else if (job.analysis.jewelleryType !== 'UNKNOWN') {
      setJewelleryType(job.analysis.jewelleryType);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job?.analysis, productCategory?.name]);

  const createMutation = useMutation({
    mutationFn: (files: File[]) => createStudioJob(productId as string, files),
    onSuccess: (res) => {
      setJobId(res.jobId);
      setConfirmSubStep('analyse');
    },
  });

  const confirmMutation = useMutation({
    mutationFn: () =>
      confirmStudioJob(productId as string, jobId as string, {
        jewelleryType: jewelleryType as Exclude<JewelleryType, 'UNKNOWN'>,
        categoryId: product?.categoryId ?? null,
        presenterId,
        generateRoseGold,
      }),
    onSuccess: invalidateJob,
  });

  const retryMutation = useMutation({
    mutationFn: (assetId: string) => {
      setRegeneratingAssetId(assetId);
      return retryStudioAsset(productId as string, jobId as string, assetId);
    },
    onSuccess: invalidateJob,
    onSettled: () => setRegeneratingAssetId(null),
  });

  const selectionMutation = useMutation({
    mutationFn: ({ assetId, input }: { assetId: string; input: { selected?: boolean; isFeatured?: boolean } }) =>
      updateStudioAssetSelection(productId as string, jobId as string, assetId, input),
    onSuccess: invalidateJob,
  });

  const cancelMutation = useMutation({
    mutationFn: () => cancelStudioJob(productId as string, jobId as string),
    onSuccess: () => navigate(`/products/${productId}/edit`),
  });

  const createError = createMutation.error instanceof ApiError ? createMutation.error.message : null;
  const confirmError = confirmMutation.error instanceof ApiError ? confirmMutation.error.message : null;

  function handleGenerateRoseGoldChange(value: boolean) {
    setGenerateRoseGold(value);
    localStorage.setItem(ROSE_GOLD_PREF_KEY, String(value));
  }

  const generateCount = resolveAssetTypesForJob({ generateRoseGold, hasPresenter: !!presenterId }).length;

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
      <p className={styles.subtitle}>
        Upload jewellery reference photos and generate a catalogue image set for {product?.name ?? 'this product'}.
      </p>

      <StudioStepper status={job?.status ?? null} confirmSubStep={confirmSubStep} generateCount={generateCount} />

      <section className={sharedStyles.cardPadded}>
        {!job && (
          <UploadStep onSubmit={(files) => createMutation.mutate(files)} isPending={createMutation.isPending} error={createError} />
        )}

        {job && job.status === 'analysing' && <p>Analysing the reference photo…</p>}

        {job && job.status === 'awaiting_confirmation' && confirmSubStep === 'analyse' && (
          <>
            <AnalyseConfirmStep
              job={job}
              productName={product?.name ?? ''}
              productCategoryName={productCategory?.name ?? null}
              jewelleryType={jewelleryType}
              onJewelleryTypeChange={setJewelleryType}
              generateRoseGold={generateRoseGold}
              onGenerateRoseGoldChange={handleGenerateRoseGoldChange}
            />
            <div className={styles.actions}>
              <button
                type="button"
                className={sharedStyles.buttonPrimary}
                disabled={!jewelleryType}
                onClick={() => setConfirmSubStep('presenter')}
              >
                Continue
              </button>
            </div>
          </>
        )}

        {job && job.status === 'awaiting_confirmation' && confirmSubStep === 'presenter' && (
          <>
            <PresenterStep
              jewelleryType={jewelleryType}
              presenterId={presenterId}
              onChange={setPresenterId}
              generateRoseGold={generateRoseGold}
            />
            {confirmError && <p className={sharedStyles.error}>{confirmError}</p>}
            <div className={styles.actions}>
              <button type="button" className={sharedStyles.button} onClick={() => setConfirmSubStep('analyse')}>
                Back
              </button>
              <button
                type="button"
                className={sharedStyles.buttonPrimary}
                disabled={confirmMutation.isPending}
                onClick={() => confirmMutation.mutate()}
              >
                {confirmMutation.isPending ? 'Starting…' : `Generate ${generateCount} Images`}
              </button>
            </div>
          </>
        )}

        {job && job.status === 'generating' && (
          <GenerateStep
            assets={job.assets}
            onRegenerate={(assetId) => retryMutation.mutate(assetId)}
            regeneratingAssetId={regeneratingAssetId}
          />
        )}

        {job && ['review_ready', 'partially_failed'].includes(job.status) && (
          <ReviewImportStep
            job={job}
            onRegenerate={(assetId) => retryMutation.mutate(assetId)}
            regeneratingAssetId={regeneratingAssetId}
            onToggleSelected={(assetId, selected) => selectionMutation.mutate({ assetId, input: { selected } })}
            onSetFeatured={(assetId) => selectionMutation.mutate({ assetId, input: { isFeatured: true } })}
            importAsset={async (assetId) => {
              await importStudioAsset(productId as string, jobId as string, assetId);
              await invalidateJob();
            }}
            completeImport={async () => {
              await completeStudioImport(productId as string, jobId as string);
              queryClient.invalidateQueries({ queryKey: ['admin-product-images', productId] });
            }}
            onImportComplete={() => navigate(`/products/${productId}/edit`)}
            onSaveAsDraft={() => navigate(`/products/${productId}/edit`)}
          />
        )}

        {job && job.status === 'importing' && <p>Importing images into the product…</p>}
        {job && job.status === 'failed' && <p className={sharedStyles.error}>Generation failed: {job.error}</p>}
        {job && job.status === 'cancelled' && <p>This job was cancelled.</p>}
      </section>
    </div>
  );
}
