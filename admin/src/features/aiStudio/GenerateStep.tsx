import { useEffect, useState } from 'react';
import sharedStyles from '../../styles/shared.module.css';
import type { StudioAsset } from '../../api/aiStudio';
import { SHOT_LABELS, groupForAssetType, metalColorForAssetType, type AssetGroup } from './generationRules';
import styles from './GenerateStep.module.css';

const GROUP_ORDER: AssetGroup[] = ['Yellow Gold', 'Rose Gold', 'Presenter'];

function elapsedLabel(startedAt: string | null, completedAt: string | null) {
  if (!startedAt) return null;
  const end = completedAt ? new Date(completedAt).getTime() : Date.now();
  const seconds = Math.max(0, Math.round((end - new Date(startedAt).getTime()) / 1000));
  return `${seconds}s`;
}

interface GenerateStepProps {
  assets: StudioAsset[];
  onRegenerate: (_assetId: string) => void;
  regeneratingAssetId: string | null;
}

// No fixed time estimate — real per-asset start/complete timestamps are
// recorded server-side, and this just ticks a clock against them.
export function GenerateStep({ assets, onRegenerate, regeneratingAssetId }: GenerateStepProps) {
  const [, forceTick] = useState(0);

  useEffect(() => {
    const anyInFlight = assets.some((a) => a.status === 'GENERATING');
    if (!anyInFlight) return;
    const timer = setInterval(() => forceTick((n) => n + 1), 1000);
    return () => clearInterval(timer);
  }, [assets]);

  return (
    <div>
      <p>Generating {assets.length} image{assets.length === 1 ? '' : 's'} — this typically takes a few minutes per image.</p>

      {GROUP_ORDER.map((group) => {
        const groupAssets = assets.filter((a) => groupForAssetType(a.assetType) === group);
        if (groupAssets.length === 0) return null;
        return (
          <div key={group} className={styles.group}>
            <h3 className={styles.groupTitle}>{group}</h3>
            <div className={styles.grid}>
              {groupAssets.map((asset) => (
                <div key={asset.id} className={styles.tile}>
                  <p className={styles.shotLabel}>{SHOT_LABELS[asset.assetType]}</p>
                  <p className={styles.metalLabel}>{metalColorForAssetType(asset.assetType)} Gold</p>
                  <div className={styles.thumbWrapper}>
                    {asset.imageUrl ? (
                      <img src={asset.imageUrl} alt={SHOT_LABELS[asset.assetType]} className={styles.thumb} />
                    ) : (
                      <span className={sharedStyles.badgeNeutral}>{asset.status}</span>
                    )}
                  </div>
                  {asset.status === 'GENERATING' && (
                    <span className={sharedStyles.badgeNeutral}>
                      Generating… {elapsedLabel(asset.generationStartedAt, asset.generationCompletedAt)}
                    </span>
                  )}
                  {asset.status === 'READY' && <span className={sharedStyles.badgeSuccess}>Ready</span>}
                  {asset.status === 'FAILED' && <span className={sharedStyles.badgeDanger}>Failed</span>}
                  {asset.status === 'PENDING' && <span className={sharedStyles.badgeNeutral}>Waiting…</span>}

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
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
