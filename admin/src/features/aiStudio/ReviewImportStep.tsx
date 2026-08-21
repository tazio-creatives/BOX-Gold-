import { useState } from 'react';
import sharedStyles from '../../styles/shared.module.css';
import type { StudioAsset, StudioJob } from '../../api/aiStudio';
import { SHOT_LABELS, metalColorForAssetType, catalogueCount, presenterCount } from './generationRules';
import styles from './ReviewImportStep.module.css';

type ImportState = 'idle' | 'importing' | 'completed' | 'partially_failed';

interface ReviewImportStepProps {
  job: StudioJob;
  onRegenerate: (_assetId: string) => void;
  regeneratingAssetId: string | null;
  onToggleSelected: (_assetId: string, _selected: boolean) => void;
  onSetFeatured: (_assetId: string) => void;
  importAsset: (_assetId: string) => Promise<unknown>;
  completeImport: () => Promise<unknown>;
  onImportComplete: () => void;
  onSaveAsDraft: () => void;
}

const CATALOGUE_TYPES = new Set(['YELLOW_FRONT', 'YELLOW_HERO_45', 'ROSE_FRONT', 'ROSE_HERO_45']);

export function ReviewImportStep({
  job,
  onRegenerate,
  regeneratingAssetId,
  onToggleSelected,
  onSetFeatured,
  importAsset,
  completeImport,
  onImportComplete,
  onSaveAsDraft,
}: ReviewImportStepProps) {
  const [importState, setImportState] = useState<ImportState>('idle');
  const [progress, setProgress] = useState({ completed: 0, total: 0 });
  const [failedAssetIds, setFailedAssetIds] = useState<string[]>([]);

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

  return (
    <div>
      <p className={styles.disclaimer}>AI output requires human verification before import.</p>

      <div className={styles.grid}>
        {assets.map((asset) => (
          <div key={asset.id} className={styles.tile}>
            <div className={styles.tileHeader}>
              <label className={styles.selectLabel}>
                <input
                  type="checkbox"
                  checked={asset.selected}
                  disabled={asset.status !== 'READY'}
                  onChange={(e) => onToggleSelected(asset.id, e.target.checked)}
                />
                Selected
              </label>
              {asset.isFeatured && <span className={sharedStyles.badgeSuccess}>Featured</span>}
            </div>

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
              {['READY', 'FAILED'].includes(asset.status) && (
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
          </div>
        ))}
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
    </div>
  );
}
