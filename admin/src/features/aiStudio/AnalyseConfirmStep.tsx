import { REAL_JEWELLERY_TYPES, type StudioJob } from '../../api/aiStudio';
import type { Category, GoldColor } from '../../api/types';
import sharedStyles from '../../styles/shared.module.css';
import styles from './AnalyseConfirmStep.module.css';

const GOLD_COLORS: { value: GoldColor; label: string }[] = [
  { value: 'YELLOW', label: 'Yellow Gold' },
  { value: 'ROSE', label: 'Rose Gold' },
  { value: 'WHITE', label: 'White Gold' },
];

function formatType(type: string) {
  return type.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

function pct(n: number) {
  return `${Math.round(n * 100)}%`;
}

interface AnalyseConfirmStepProps {
  job: StudioJob;
  categories: Category[];
  jewelleryType: string;
  onJewelleryTypeChange: (_v: string) => void;
  categoryId: string | null;
  onCategoryIdChange: (_v: string | null) => void;
  metalColor: GoldColor | '';
  onMetalColorChange: (_v: GoldColor | '') => void;
}

// AI-detected attributes are suggestions only — nothing here is ever applied
// to the product without the admin explicitly confirming it below (plan §5).
export function AnalyseConfirmStep({
  job,
  categories,
  jewelleryType,
  onJewelleryTypeChange,
  categoryId,
  onCategoryIdChange,
  metalColor,
  onMetalColorChange,
}: AnalyseConfirmStepProps) {
  const analysis = job.analysis;
  const isLowConfidence =
    !analysis || analysis.jewelleryType === 'UNKNOWN' || analysis.jewelleryTypeConfidence < job.categoryConfidenceThreshold;

  return (
    <div>
      <div className={styles.referenceRow}>
        {job.referenceImageUrls.map((url) => (
          <img key={url} src={url} alt="Reference" className={styles.referenceImg} />
        ))}
      </div>

      {analysis && (
        <div className={styles.attrGrid}>
          <div className={styles.attrCard}>
            <p className={styles.attrLabel}>Detected Type</p>
            <p className={styles.attrValue}>{formatType(analysis.jewelleryType)}</p>
            <span className={styles.confidence}>Confidence: {pct(analysis.jewelleryTypeConfidence)}</span>
          </div>
          <div className={styles.attrCard}>
            <p className={styles.attrLabel}>Metal Colour</p>
            <p className={styles.attrValue}>{analysis.metalColor ? formatType(analysis.metalColor) : '—'}</p>
            <span className={styles.confidence}>Confidence: {pct(analysis.metalColorConfidence)}</span>
          </div>
          <div className={styles.attrCard}>
            <p className={styles.attrLabel}>Gemstone</p>
            <p className={styles.attrValue}>{analysis.gemstone ?? '—'}</p>
            <span className={styles.confidence}>Confidence: {pct(analysis.gemstoneConfidence)}</span>
          </div>
          <div className={styles.attrCard}>
            <p className={styles.attrLabel}>Dominant Shape</p>
            <p className={styles.attrValue}>{analysis.dominantShape ?? '—'}</p>
            <span className={styles.confidence}>Confidence: {pct(analysis.shapeConfidence)}</span>
          </div>
        </div>
      )}

      {isLowConfidence && (
        <p className={styles.notice}>
          The AI couldn't confidently identify this item — please select the correct jewellery type below before
          continuing.
        </p>
      )}

      <div className={sharedStyles.formGrid2}>
        <label className={sharedStyles.field}>
          Jewellery Type (required)
          <select value={jewelleryType} onChange={(e) => onJewelleryTypeChange(e.target.value)}>
            <option value="">— Select —</option>
            {REAL_JEWELLERY_TYPES.map((t) => (
              <option key={t} value={t}>
                {formatType(t)}
              </option>
            ))}
          </select>
        </label>

        <label className={sharedStyles.field}>
          Product Category
          <select value={categoryId ?? ''} onChange={(e) => onCategoryIdChange(e.target.value || null)}>
            <option value="">— None —</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>

        <label className={sharedStyles.field}>
          Metal Colour
          <select value={metalColor} onChange={(e) => onMetalColorChange(e.target.value as GoldColor | '')}>
            <option value="">— None —</option>
            {GOLD_COLORS.map((g) => (
              <option key={g.value} value={g.value}>
                {g.label}
              </option>
            ))}
          </select>
        </label>
      </div>
    </div>
  );
}
