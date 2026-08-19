import { useState } from 'react';
import sharedStyles from '../../styles/shared.module.css';
import type { StudioAsset } from '../../api/aiStudio';
import styles from './ReviewImportStep.module.css';

const SHOT_LABELS: Record<StudioAsset['shotType'], string> = {
  FRONT: 'Front Catalogue',
  HERO_45: '45° Hero Angle',
  PRESENTER: 'Presenter',
  LIFESTYLE: 'Lifestyle Display',
};

interface ReviewImportStepProps {
  assets: StudioAsset[];
  onRetry: (_assetId: string) => void;
  retryingAssetId: string | null;
  onImport: () => void;
  isImporting: boolean;
}

export function ReviewImportStep({ assets, onRetry, retryingAssetId, onImport, isImporting }: ReviewImportStepProps) {
  // Belt-and-suspenders instant disable on click, ahead of the mutation's own
  // isPending flag reflecting in a re-render (plan §8: "disable the
  // submission button immediately after the first click").
  const [hasClickedImport, setHasClickedImport] = useState(false);
  const allReady = assets.every((a) => a.status === 'READY');

  return (
    <div>
      <p className={styles.disclaimer}>AI output requires human verification before import.</p>

      <div className={styles.grid}>
        {assets
          .slice()
          .sort((a, b) => a.displayOrder - b.displayOrder)
          .map((asset) => (
            <div key={asset.id} className={styles.tile}>
              <p className={styles.shotLabel}>{SHOT_LABELS[asset.shotType]}</p>
              <div className={styles.thumbWrapper}>
                {asset.imageUrl ? (
                  <img src={asset.imageUrl} alt={SHOT_LABELS[asset.shotType]} className={styles.thumb} />
                ) : (
                  <span className={sharedStyles.badgeDanger}>Failed</span>
                )}
              </div>
              {asset.qualityAssessment != null && (
                <p className={sharedStyles.error} style={{ fontSize: 'var(--text-xs)' }}>
                  AI quality assessment — not a certified product-accuracy measurement
                </p>
              )}
              <div className={styles.tileActions}>
                {asset.imageUrl && (
                  <a
                    className={sharedStyles.buttonLink}
                    href={asset.imageUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    View full size
                  </a>
                )}
                {asset.status === 'FAILED' && (
                  <button
                    type="button"
                    className={sharedStyles.button}
                    disabled={retryingAssetId === asset.id}
                    onClick={() => onRetry(asset.id)}
                  >
                    {retryingAssetId === asset.id ? 'Retrying…' : 'Retry'}
                  </button>
                )}
              </div>
            </div>
          ))}
      </div>

      <button
        type="button"
        className={sharedStyles.buttonPrimary}
        disabled={!allReady || isImporting || hasClickedImport}
        onClick={() => {
          setHasClickedImport(true);
          onImport();
        }}
      >
        {isImporting ? 'Importing…' : 'Import 4 Images to Product'}
      </button>
      {!allReady && (
        <p className={sharedStyles.error}>All four images must be ready before importing — retry any failed shot.</p>
      )}
    </div>
  );
}
