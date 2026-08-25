import { useState } from 'react';
import sharedStyles from '../../styles/shared.module.css';
import type { StudioAsset, StudioJob, PromptCreativeOverride } from '../../api/aiStudio';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { Modal } from '../../components/Modal';
import { SHOT_LABELS, metalColorForAssetType, catalogueCount, presenterCount } from './generationRules';
import styles from './ReviewImportStep.module.css';

type ImportState = 'idle' | 'importing' | 'completed' | 'partially_failed';

interface ReviewImportStepProps {
  job: StudioJob;
  onRegenerate: (_assetId: string) => void;
  regeneratingAssetId: string | null;
  onToggleSelected: (_assetId: string, _selected: boolean) => void;
  onSetFeatured: (_assetId: string) => void;
  onAcceptValidation: (_assetId: string) => void;
  onEditPromptAndRegenerate: (_assetId: string, _override: PromptCreativeOverride) => void;
  importAsset: (_assetId: string) => Promise<unknown>;
  completeImport: () => Promise<unknown>;
  onImportComplete: () => void;
  onSaveAsDraft: () => void;
}

const CATALOGUE_TYPES = new Set(['YELLOW_FRONT', 'YELLOW_HERO_45', 'ROSE_FRONT', 'ROSE_HERO_45']);
const CREATIVE_FIELDS: { key: keyof PromptCreativeOverride; label: string }[] = [
  { key: 'background', label: 'Background' },
  { key: 'lighting', label: 'Lighting' },
  { key: 'composition', label: 'Composition' },
  { key: 'presenterPose', label: 'Presenter Pose' },
  { key: 'cameraAngle', label: 'Camera Angle' },
  { key: 'additionalInstructions', label: 'Additional Safe Instructions' },
];

export function ReviewImportStep({
  job,
  onRegenerate,
  regeneratingAssetId,
  onToggleSelected,
  onSetFeatured,
  onAcceptValidation,
  onEditPromptAndRegenerate,
  importAsset,
  completeImport,
  onImportComplete,
  onSaveAsDraft,
}: ReviewImportStepProps) {
  const [importState, setImportState] = useState<ImportState>('idle');
  const [progress, setProgress] = useState({ completed: 0, total: 0 });
  const [failedAssetIds, setFailedAssetIds] = useState<string[]>([]);
  const [acceptingAssetId, setAcceptingAssetId] = useState<string | null>(null);
  const [editingAsset, setEditingAsset] = useState<StudioAsset | null>(null);
  const [editValues, setEditValues] = useState<PromptCreativeOverride>({});

  const assets = job.assets.slice().sort((a, b) => a.displayOrder - b.displayOrder);
  const selected = assets.filter((a) => a.selected);
  const allSelectedReady = selected.every((a) => a.status === 'READY');
  const featured = assets.find((a) => a.isFeatured);
  const assetTypes = assets.map((a) => a.assetType);

  async function runImport(targets: StudioAsset[]) {
    setImportState('importing');
    setProgress({ completed: 0, total: targets.length });
    const failed: string[] = [];
    for (const asset of targets) {
      try {
        await importAsset(asset.id);
      } catch {
        failed.push(asset.id);
      }
      setProgress((p) => ({ ...p, completed: p.completed + 1 }));
    }
    if (failed.length > 0) {
      setFailedAssetIds(failed);
      setImportState('partially_failed');
      return;
    }
    try {
      await completeImport();
      setImportState('completed');
      onImportComplete();
    } catch {
      setFailedAssetIds(targets.map((a) => a.id));
      setImportState('partially_failed');
    }
  }

  function handleImport() {
    runImport(selected.filter((a) => !a.imported));
  }

  function handleRetryFailedImports() {
    const targets = assets.filter((a) => failedAssetIds.includes(a.id));
    runImport(targets);
  }

  function openEditPrompt(asset: StudioAsset) {
    setEditingAsset(asset);
    setEditValues(asset.customCreativeInstructions ?? {});
  }

  function saveEditPrompt() {
    if (!editingAsset) return;
    onEditPromptAndRegenerate(editingAsset.id, editValues);
    setEditingAsset(null);
  }

  return (
    <div>
      <p className={styles.disclaimer}>AI output requires human verification before import.</p>

      <div className={styles.grid}>
        {assets.map((asset) => {
          const needsReview =
            !!asset.validationStatus && asset.validationStatus !== 'passed' && !asset.validationAccepted;
          return (
            <div key={asset.id} className={styles.tile}>
              <div className={styles.tileHeader}>
                {!needsReview && (
                  <label className={styles.selectLabel}>
                    <input
                      type="checkbox"
                      checked={asset.selected}
                      disabled={asset.status !== 'READY'}
                      onChange={(e) => onToggleSelected(asset.id, e.target.checked)}
                    />
                    Selected
                  </label>
                )}
                {asset.isFeatured && <span className={sharedStyles.badgeSuccess}>Featured</span>}
              </div>

              {asset.validationStatus && (
                <div className={styles.validationRow}>
                  <span
                    className={
                      asset.validationStatus === 'passed'
                        ? sharedStyles.badgeSuccess
                        : asset.validationStatus === 'warning'
                          ? sharedStyles.badgeWarning
                          : sharedStyles.badgeDanger
                    }
                  >
                    {asset.validationStatus === 'passed'
                      ? 'Passed'
                      : asset.validationStatus === 'warning'
                        ? 'Warning'
                        : 'Failed'}
                  </span>
                  {asset.validationAccepted && asset.validationStatus !== 'passed' && (
                    <span className={sharedStyles.badgeNeutral}>Accepted</span>
                  )}
                </div>
              )}
              {asset.validationResult && asset.validationResult.validationMessages.length > 0 && (
                <ul className={styles.validationMessages}>
                  {asset.validationResult.validationMessages.map((m) => (
                    <li key={m}>{m}</li>
                  ))}
                </ul>
              )}

              <p className={styles.shotLabel}>{SHOT_LABELS[asset.assetType]}</p>
              <p className={styles.metaLine}>
                {metalColorForAssetType(asset.assetType)} Gold
                {asset.assetType.startsWith('PRESENTER_') && job.presenter ? ` · ${job.presenter.displayName}` : ''}
              </p>

              <div className={styles.thumbWrapper}>
                {asset.imageUrl ? (
                  <img src={asset.imageUrl} alt={SHOT_LABELS[asset.assetType]} className={styles.thumb} />
                ) : (
                  <span className={sharedStyles.badgeDanger}>Failed</span>
                )}
              </div>

              <div className={styles.tileActions}>
                {asset.imageUrl && (
                  <a className={sharedStyles.buttonLink} href={asset.imageUrl} target="_blank" rel="noreferrer">
                    View full size
                  </a>
                )}
                {asset.status === 'READY' && CATALOGUE_TYPES.has(asset.assetType) && !asset.isFeatured && (
                  <button type="button" className={sharedStyles.buttonLink} onClick={() => onSetFeatured(asset.id)}>
                    Set as Featured
                  </button>
                )}
                {['READY', 'FAILED'].includes(asset.status) && !needsReview && (
                  <button
                    type="button"
                    className={sharedStyles.buttonLink}
                    disabled={regeneratingAssetId === asset.id}
                    onClick={() => onRegenerate(asset.id)}
                  >
                    {regeneratingAssetId === asset.id
                      ? 'Requesting…'
                      : asset.status === 'FAILED'
                        ? 'Retry'
                        : 'Regenerate'}
                  </button>
                )}
              </div>

              {needsReview && (
                <div className={styles.reviewActions}>
                  <button
                    type="button"
                    className={sharedStyles.buttonLink}
                    disabled={regeneratingAssetId === asset.id}
                    onClick={() => onRegenerate(asset.id)}
                  >
                    Regenerate Automatically
                  </button>
                  <button type="button" className={sharedStyles.buttonLink} onClick={() => openEditPrompt(asset)}>
                    Edit Prompt & Regenerate
                  </button>
                  <button
                    type="button"
                    className={sharedStyles.buttonLink}
                    onClick={() => setAcceptingAssetId(asset.id)}
                  >
                    Accept Anyway
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className={styles.summary}>
        <h3 className={styles.summaryTitle}>Import Summary</h3>
        <dl className={styles.summaryList}>
          <div className={styles.summaryRow}>
            <dt>Presenter</dt>
            <dd>{job.presenter ? job.presenter.displayName : 'No Presenter'}</dd>
          </div>
          <div className={styles.summaryRow}>
            <dt>Rose Gold</dt>
            <dd>{job.generateRoseGold ? 'On' : 'Off'}</dd>
          </div>
          <div className={styles.summaryRow}>
            <dt>Featured Image</dt>
            <dd>{featured ? SHOT_LABELS[featured.assetType] : '—'}</dd>
          </div>
          <div className={styles.summaryRow}>
            <dt>Selected Catalogue Images</dt>
            <dd>{selected.filter((a) => CATALOGUE_TYPES.has(a.assetType)).length} / {catalogueCount(assetTypes)}</dd>
          </div>
          <div className={styles.summaryRow}>
            <dt>Selected Presenter Images</dt>
            <dd>{selected.filter((a) => a.assetType.startsWith('PRESENTER_')).length} / {presenterCount(assetTypes)}</dd>
          </div>
          <div className={styles.summaryRowTotal}>
            <dt>Total Selected</dt>
            <dd>{selected.length}</dd>
          </div>
          <div className={styles.summaryRow}>
            <dt>Import Destination</dt>
            <dd>Product Gallery</dd>
          </div>
        </dl>
      </div>

      {importState === 'importing' && (
        <div className={styles.progressWrapper}>
          <div className={styles.progressTrack}>
            <div
              className={styles.progressFill}
              style={{ width: `${progress.total ? Math.round((progress.completed / progress.total) * 100) : 0}%` }}
            />
          </div>
          <p className={styles.progressLabel}>
            Importing… {progress.completed}/{progress.total} ({progress.total ? Math.round((progress.completed / progress.total) * 100) : 0}%)
          </p>
        </div>
      )}

      {importState === 'partially_failed' && (
        <p className={sharedStyles.error}>
          {failedAssetIds.length} image{failedAssetIds.length === 1 ? '' : 's'} failed to import.
        </p>
      )}

      <div className={styles.actions}>
        {importState === 'partially_failed' ? (
          <button type="button" className={sharedStyles.buttonPrimary} onClick={handleRetryFailedImports}>
            Retry Failed Imports
          </button>
        ) : (
          <button
            type="button"
            className={sharedStyles.buttonPrimary}
            disabled={!allSelectedReady || selected.length === 0 || importState === 'importing'}
            onClick={handleImport}
          >
            {importState === 'importing' ? 'Importing…' : `Import ${selected.length} Image${selected.length === 1 ? '' : 's'} to Product`}
          </button>
        )}
        <button type="button" className={sharedStyles.button} onClick={onSaveAsDraft} disabled={importState === 'importing'}>
          Save as Draft
        </button>
      </div>
      {!allSelectedReady && (
        <p className={sharedStyles.error}>All selected images must be ready before importing — retry any failed shot.</p>
      )}

      {acceptingAssetId && (
        <ConfirmDialog
          title="Accept this image anyway?"
          message="This image did not pass automatic validation. Accepting it lets you select it for import despite the flagged issue — only do this after reviewing it yourself."
          confirmLabel="Accept Anyway"
          cancelLabel="Cancel"
          danger
          onConfirm={() => {
            onAcceptValidation(acceptingAssetId);
            setAcceptingAssetId(null);
          }}
          onCancel={() => setAcceptingAssetId(null)}
        />
      )}

      {editingAsset && (
        <Modal title={`Edit Prompt — ${SHOT_LABELS[editingAsset.assetType]}`} onClose={() => setEditingAsset(null)}>
          <p className={styles.disclaimer}>
            Only the creative fields below can be changed — the product, category, and safety rules stay locked.
          </p>
          <div className={styles.creativeFields}>
            {CREATIVE_FIELDS.map(({ key, label }) => (
              <label key={key} className={sharedStyles.field}>
                {label}
                <textarea
                  rows={2}
                  value={editValues[key] ?? ''}
                  onChange={(e) => setEditValues((v) => ({ ...v, [key]: e.target.value }))}
                />
              </label>
            ))}
          </div>
          <div className={styles.modalActions}>
            <button type="button" className={sharedStyles.button} onClick={() => setEditingAsset(null)}>
              Cancel
            </button>
            <button type="button" className={sharedStyles.buttonPrimary} onClick={saveEditPrompt}>
              Save & Regenerate
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
