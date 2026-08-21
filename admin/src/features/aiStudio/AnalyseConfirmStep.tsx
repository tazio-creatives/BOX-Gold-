import { useState } from 'react';
import { REAL_JEWELLERY_TYPES, type JewelleryType, type StudioJob } from '../../api/aiStudio';
import { Toggle } from '../../components/Toggle';
import { inferJewelleryTypeFromCategory } from './generationRules';
import sharedStyles from '../../styles/shared.module.css';
import styles from './AnalyseConfirmStep.module.css';

function formatType(type: string) {
  return type.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

function pct(n: number) {
  return `${Math.round(n * 100)}%`;
}

interface AnalyseConfirmStepProps {
  job: StudioJob;
  productName: string;
  productCategoryName: string | null;
  jewelleryType: JewelleryType | '';
  onJewelleryTypeChange: (_v: JewelleryType) => void;
  generateRoseGold: boolean;
  onGenerateRoseGoldChange: (_v: boolean) => void;
}

// AI-detected attributes are suggestions only — nothing here is ever applied
// to the product without the admin explicitly confirming it below (plan §5).
// Jewellery Type/Category/Metal Colour dropdowns are gone — the studio is
// always opened from an existing product, so that information is read from
// the product record, only overridable via "Update Product Category" if the
// AI disagrees with it.
export function AnalyseConfirmStep({
  job,
  productName,
  productCategoryName,
  jewelleryType,
  onJewelleryTypeChange,
  generateRoseGold,
  onGenerateRoseGoldChange,
}: AnalyseConfirmStepProps) {
  const [isEditingType, setIsEditingType] = useState(false);
  const analysis = job.analysis;

  const inferredType = inferJewelleryTypeFromCategory(productCategoryName);
  const hasComparableCategory = inferredType != null;
  const matches = hasComparableCategory && analysis && analysis.jewelleryType === inferredType;
  const mismatches = hasComparableCategory && analysis && analysis.jewelleryType !== 'UNKNOWN' && !matches;

  return (
    <div>
      <div className={styles.referenceRow}>
        {job.referenceImageUrls.map((url) => (
          <img key={url} src={url} alt="Reference" className={styles.referenceImg} />
        ))}
      </div>

      <div className={styles.productInfo}>
        <div>
          <p className={styles.productInfoLabel}>Product Name</p>
          <p className={styles.productInfoValue}>{productName}</p>
        </div>
        <div>
          <p className={styles.productInfoLabel}>Product Category</p>
          <p className={styles.productInfoValue}>{productCategoryName ?? '—'}</p>
        </div>
      </div>

      {analysis && (
        <div className={styles.attrGrid}>
          <div className={styles.attrCard}>
            <p className={styles.attrLabel}>AI-Detected Jewellery Type</p>
            <p className={styles.attrValue}>{formatType(analysis.jewelleryType)}</p>
            <span className={styles.confidence}>Confidence: {pct(analysis.jewelleryTypeConfidence)}</span>
          </div>
          <div className={styles.attrCard}>
            <p className={styles.attrLabel}>Detected Gemstone</p>
            <p className={styles.attrValue}>{analysis.gemstone ?? '—'}</p>
            <span className={styles.confidence}>Confidence: {pct(analysis.gemstoneConfidence)}</span>
          </div>
          <div className={styles.attrCard}>
            <p className={styles.attrLabel}>Dominant Shape</p>
            <p className={styles.attrValue}>{analysis.dominantShape ?? '—'}</p>
            <span className={styles.confidence}>Confidence: {pct(analysis.shapeConfidence)}</span>
          </div>
          <div className={styles.attrCard}>
            <p className={styles.attrLabel}>Detection Confidence</p>
            <p className={styles.attrValue}>{pct(analysis.jewelleryTypeConfidence)}</p>
          </div>
        </div>
      )}

      {matches && (
        <p className={styles.matchNotice}>Product information matches the uploaded jewellery.</p>
      )}
      {mismatches && analysis && (
        <p className={styles.mismatchNotice}>
          The existing product category is {productCategoryName}, but AI detected {formatType(analysis.jewelleryType)}.
        </p>
      )}

      {(mismatches || isEditingType) && (
        <div className={styles.mismatchActions}>
          {!isEditingType && (
            <>
              <button type="button" className={sharedStyles.button} onClick={() => onJewelleryTypeChange(inferredType as JewelleryType)}>
                Use Product Information
              </button>
              <button type="button" className={sharedStyles.button} onClick={() => setIsEditingType(true)}>
                Update Product Category
              </button>
            </>
          )}
          {isEditingType && (
            <label className={sharedStyles.field}>
              Jewellery Type for this generation (does not change the product's category)
              <select value={jewelleryType} onChange={(e) => onJewelleryTypeChange(e.target.value as JewelleryType)}>
                <option value="">— Select —</option>
                {REAL_JEWELLERY_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {formatType(t)}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
      )}

      <section className={styles.generationPlan}>
        <h3 className={styles.generationPlanTitle}>Generation Plan</h3>
        <Toggle
          checked={generateRoseGold}
          onChange={onGenerateRoseGoldChange}
          label="Generate Rose Gold Version"
          helperText="Creates Rose Gold catalogue and presenter images in addition to the Yellow Gold images."
        />
      </section>
    </div>
  );
}
