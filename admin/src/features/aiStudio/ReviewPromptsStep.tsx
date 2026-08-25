import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  fetchPromptPreview,
  type JewelleryType,
  type PromptOverrides,
  type PromptCreativeOverride,
} from '../../api/aiStudio';
import { SHOT_LABELS } from './generationRules';
import sharedStyles from '../../styles/shared.module.css';
import styles from './ReviewPromptsStep.module.css';

function formatType(type: string) {
  return type.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

const CREATIVE_FIELDS: { key: keyof PromptCreativeOverride; label: string }[] = [
  { key: 'background', label: 'Background' },
  { key: 'lighting', label: 'Lighting' },
  { key: 'composition', label: 'Composition' },
  { key: 'presenterPose', label: 'Presenter Pose' },
  { key: 'cameraAngle', label: 'Camera Angle' },
  { key: 'additionalInstructions', label: 'Additional Safe Instructions' },
];

interface ReviewPromptsStepProps {
  productId: string;
  jobId: string;
  jewelleryType: Exclude<JewelleryType, 'UNKNOWN'>;
  presenterId: string | null;
  presenterName: string | null;
  generateRoseGold: boolean;
  promptOverrides: PromptOverrides;
  onPromptOverridesChange: (_v: PromptOverrides) => void;
}

// "Review Prompts" — the third Choose-Presenter sub-screen. Only ever
// previews prompts (fetchPromptPreview writes nothing, starts nothing); the
// actual image-generation request only goes out once the admin clicks
// "Confirm & Generate" on the page below.
export function ReviewPromptsStep({
  productId,
  jobId,
  jewelleryType,
  presenterId,
  presenterName,
  generateRoseGold,
  promptOverrides,
  onPromptOverridesChange,
}: ReviewPromptsStepProps) {
  const [expandedAssetType, setExpandedAssetType] = useState<string | null>(null);

  const { data, isFetching, isError } = useQuery({
    queryKey: [
      'ai-studio-prompt-preview',
      productId,
      jobId,
      jewelleryType,
      presenterId,
      generateRoseGold,
      promptOverrides,
    ],
    queryFn: () =>
      fetchPromptPreview(productId, jobId, { jewelleryType, presenterId, generateRoseGold, promptOverrides }),
  });
  const prompts = data?.prompts ?? [];

  function setOverride(assetType: string, override: PromptCreativeOverride | null) {
    const next = { ...promptOverrides };
    if (override && Object.values(override).some((v) => v)) {
      next[assetType] = override;
    } else {
      delete next[assetType];
    }
    onPromptOverridesChange(next);
  }

  return (
    <div>
      <p>
        Review the exact prompt for every planned image before generating. Use the recommended prompt, or customise
        the creative fields only — the product, category, and safety rules always stay locked.
      </p>

      {isFetching && prompts.length === 0 && <p>Loading prompt previews…</p>}
      {isError && <p className={sharedStyles.error}>Could not load prompt previews — try again.</p>}

      <div className={styles.grid}>
        {prompts.map((p) => {
          const override = promptOverrides[p.assetType];
          const isCustomising = !!override;
          const isExpanded = expandedAssetType === p.assetType;
          return (
            <div key={p.assetType} className={styles.card}>
              <div className={styles.cardHeader}>
                <p className={styles.cardTitle}>{SHOT_LABELS[p.assetType]}</p>
                <span className={p.mode === 'customised' ? sharedStyles.badgeWarning : sharedStyles.badgeSuccess}>
                  {p.mode === 'customised' ? 'Customised' : 'Recommended'}
                </span>
              </div>
              <p className={styles.cardMeta}>
                {formatType(jewelleryType)} · {p.metalColor === 'ROSE' ? 'Rose' : 'Yellow'} Gold
                {p.assetType.startsWith('PRESENTER_') && presenterName ? ` · ${presenterName}` : ''}
              </p>

              <div className={styles.modeToggle}>
                <button
                  type="button"
                  className={!isCustomising ? sharedStyles.buttonPrimary : sharedStyles.button}
                  onClick={() => setOverride(p.assetType, null)}
                >
                  Use Recommended
                </button>
                <button
                  type="button"
                  className={isCustomising ? sharedStyles.buttonPrimary : sharedStyles.button}
                  onClick={() => setOverride(p.assetType, override ?? {})}
                >
                  Customise Prompt
                </button>
              </div>

              {isCustomising && (
                <div className={styles.creativeFields}>
                  {CREATIVE_FIELDS.map(({ key, label }) => (
                    <label key={key} className={sharedStyles.field}>
                      {label}
                      <textarea
                        rows={2}
                        placeholder={p.creativeInstructions[key] || undefined}
                        value={override?.[key] ?? ''}
                        onChange={(e) => setOverride(p.assetType, { ...override, [key]: e.target.value })}
                      />
                    </label>
                  ))}
                  <button
                    type="button"
                    className={sharedStyles.buttonLink}
                    onClick={() => setOverride(p.assetType, null)}
                  >
                    Reset to Recommended
                  </button>
                </div>
              )}

              <button
                type="button"
                className={sharedStyles.buttonLink}
                onClick={() => setExpandedAssetType(isExpanded ? null : p.assetType)}
              >
                {isExpanded ? 'Hide Final Prompt' : 'Preview Final Prompt'}
              </button>

              {isExpanded && (
                <div className={styles.promptPreview}>
                  <PromptSection title="Locked Product Rules" items={p.lockedProductRules} />
                  {p.categoryPlacementRules.length > 0 && (
                    <PromptSection title="Category Placement Rules" items={p.categoryPlacementRules} />
                  )}
                  <PromptSection title="Creative Instructions" items={Object.values(p.creativeInstructions).filter(Boolean)} />
                  <PromptSection title="Negative Instructions" items={p.negativeInstructions} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PromptSection({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div className={styles.promptSection}>
      <p className={styles.promptSectionTitle}>{title}</p>
      <ul className={styles.promptSectionList}>
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}
