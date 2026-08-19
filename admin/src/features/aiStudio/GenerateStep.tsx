import { useEffect, useState } from 'react';
import sharedStyles from '../../styles/shared.module.css';
import type { StudioAsset } from '../../api/aiStudio';
import styles from './GenerateStep.module.css';

const SHOT_LABELS: Record<StudioAsset['shotType'], string> = {
  FRONT: 'Front Catalogue',
  HERO_45: '45° Hero Angle',
  PRESENTER: 'Presenter',
  LIFESTYLE: 'Lifestyle Display',
};

function elapsedLabel(startedAt: string | null, completedAt: string | null) {
  if (!startedAt) return null;
  const end = completedAt ? new Date(completedAt).getTime() : Date.now();
  const seconds = Math.max(0, Math.round((end - new Date(startedAt).getTime()) / 1000));
  return `${seconds}s`;
}

// No fixed time estimate — real per-asset start/complete timestamps are
// recorded server-side, and this just ticks a clock against them.
export function GenerateStep({ assets }: { assets: StudioAsset[] }) {
  const [, forceTick] = useState(0);

  useEffect(() => {
    const anyInFlight = assets.some((a) => a.status === 'GENERATING');
    if (!anyInFlight) return;
    const timer = setInterval(() => forceTick((n) => n + 1), 1000);
    return () => clearInterval(timer);
  }, [assets]);

  return (
    <div>
      <p>Generating all four shots — this typically takes a few minutes per image.</p>
      <div className={styles.grid}>
        {assets.map((asset) => (
          <div key={asset.id} className={styles.tile}>
            <p className={styles.shotLabel}>{SHOT_LABELS[asset.shotType]}</p>
            <div className={styles.thumbWrapper}>
              {asset.imageUrl ? (
                <img src={asset.imageUrl} alt={SHOT_LABELS[asset.shotType]} className={styles.thumb} />
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
          </div>
        ))}
      </div>
    </div>
  );
}
