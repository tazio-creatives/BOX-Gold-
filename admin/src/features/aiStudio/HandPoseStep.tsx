import { HAND_POSES, formatHandPose, type HandPoseId } from '../../api/aiStudio';
import { resolveAssetTypesForJob, catalogueCount, handShotCount } from './generationRules';
import styles from './PresenterStep.module.css';

const HAND_POSE_BLURBS: Record<HandPoseId, string> = {
  BACK_OF_HAND_HERO: 'Viewed from behind the hand, fingers naturally separated. The default for Hand Pose 1.',
  ELEGANT_DIAGONAL: 'Fingers gently curved, angled naturally across the frame. The default for Hand Pose 2.',
  SIDE_ROTATION: 'The hand gently turned to reveal the ring from a three-quarter angle.',
  SOFT_RESTING_POSE: 'Fingers relaxed and gently curled, as if resting on a surface.',
  FINGER_DETAIL_CLOSEUP: 'A tight close-up on the ring finger, showcasing the ring design.',
};

interface HandPoseStepProps {
  handPose: HandPoseId;
  onChange: (_v: HandPoseId) => void;
  generateRoseGold: boolean;
}

// Ring-only replacement for PresenterStep — renamed "Presenter Style" ->
// "Hand Pose" (no Contemporary/Traditional, no presenter entity or
// reference photos at all). Hand Pose 2 is always the next pose in
// HAND_POSES from whatever's picked here (see resolveAssetTypesForJob /
// aiStudioService.js's nextHandPose), so there's only ever one choice to
// make, not two. Reuses PresenterStep's card-grid CSS for a consistent look.
export function HandPoseStep({ handPose, onChange, generateRoseGold }: HandPoseStepProps) {
  const assetTypes = resolveAssetTypesForJob({ generateRoseGold, hasPresenter: false, jewelleryType: 'RING' });
  const catalogue = catalogueCount(assetTypes);
  const handShots = handShotCount(assetTypes);

  return (
    <div>
      <p>
        Choose the pose for Hand Pose 1 — Hand Pose 2 automatically uses a visibly different pose, so the two hand
        shots are never near-duplicates.
      </p>

      <div className={styles.grid}>
        {HAND_POSES.map((pose) => (
          <button
            key={pose}
            type="button"
            className={handPose === pose ? styles.cardSelected : styles.card}
            onClick={() => onChange(pose)}
            aria-pressed={handPose === pose}
          >
            {handPose === pose && <span className={styles.checkmark}>✓</span>}
            <p className={styles.cardTitle}>{formatHandPose(pose)}</p>
            <p className={styles.cardBody}>{HAND_POSE_BLURBS[pose]}</p>
          </button>
        ))}
      </div>

      <div className={styles.summary}>
        <h3 className={styles.summaryTitle}>Generation Summary</h3>
        <dl className={styles.summaryList}>
          <div className={styles.summaryRow}>
            <dt>Hand Pose 1</dt>
            <dd>{formatHandPose(handPose)}</dd>
          </div>
          <div className={styles.summaryRow}>
            <dt>Rose Gold</dt>
            <dd>{generateRoseGold ? 'On' : 'Off'}</dd>
          </div>
          <div className={styles.summaryRow}>
            <dt>Hand Images</dt>
            <dd>{handShots}</dd>
          </div>
          <div className={styles.summaryRow}>
            <dt>Catalogue Images</dt>
            <dd>{catalogue}</dd>
          </div>
          <div className={styles.summaryRowTotal}>
            <dt>Total Images</dt>
            <dd>{assetTypes.length}</dd>
          </div>
        </dl>
      </div>
    </div>
  );
}
