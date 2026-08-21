import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchPresenters, fetchPresenter, type PresenterSummary } from '../../api/presenters';
import type { JewelleryType } from '../../api/aiStudio';
import { Modal } from '../../components/Modal';
import sharedStyles from '../../styles/shared.module.css';
import styles from './PresenterStep.module.css';
import { resolveAssetTypesForJob, catalogueCount, presenterCount } from './generationRules';

interface PresenterStepProps {
  jewelleryType: JewelleryType | '';
  presenterId: string | null;
  onChange: (_v: string | null) => void;
  generateRoseGold: boolean;
}

export function PresenterStep({ jewelleryType, presenterId, onChange, generateRoseGold }: PresenterStepProps) {
  const [viewingPresenterId, setViewingPresenterId] = useState<string | null>(null);

  // Fetch every active presenter (not filtered server-side) — unsupported
  // ones must still render, just disabled, rather than disappear.
  const { data } = useQuery({
    queryKey: ['ai-studio-presenters'],
    queryFn: () => fetchPresenters(),
  });
  const presenters = data?.presenters ?? [];

  const { data: viewingData } = useQuery({
    queryKey: ['presenter-detail', viewingPresenterId],
    queryFn: () => fetchPresenter(viewingPresenterId as string),
    enabled: !!viewingPresenterId,
  });

  const selectedPresenter = presenters.find((p) => p.id === presenterId) ?? null;
  const assetTypes = resolveAssetTypesForJob({ generateRoseGold, hasPresenter: !!presenterId });
  const catalogue = catalogueCount(assetTypes);
  const presenterShots = presenterCount(assetTypes);

  return (
    <div>
      <p>Presenter generation is optional — pick a saved presenter, or generate catalogue images only.</p>

      <div className={styles.grid}>
        <button
          type="button"
          className={presenterId === null ? styles.cardSelected : styles.card}
          onClick={() => onChange(null)}
          aria-pressed={presenterId === null}
        >
          {presenterId === null && <span className={styles.checkmark}>✓</span>}
          <div className={styles.noPresenterPreview}>No Presenter</div>
          <p className={styles.cardTitle}>No Presenter</p>
          <p className={styles.cardBody}>Generate catalogue images only.</p>
        </button>

        {presenters.map((presenter) => {
          const supported = !jewelleryType || presenter.supportedJewelleryTypes.includes(jewelleryType);
          return (
            <PresenterCard
              key={presenter.id}
              presenter={presenter}
              selected={presenterId === presenter.id}
              disabled={!supported}
              onSelect={() => onChange(presenter.id)}
              onViewReferences={() => setViewingPresenterId(presenter.id)}
            />
          );
        })}
      </div>

      <div className={styles.summary}>
        <h3 className={styles.summaryTitle}>Generation Summary</h3>
        <dl className={styles.summaryList}>
          <div className={styles.summaryRow}>
            <dt>Presenter</dt>
            <dd>{selectedPresenter ? selectedPresenter.displayName : 'No Presenter'}</dd>
          </div>
          <div className={styles.summaryRow}>
            <dt>Rose Gold</dt>
            <dd>{generateRoseGold ? 'On' : 'Off'}</dd>
          </div>
          <div className={styles.summaryRow}>
            <dt>Catalogue Images</dt>
            <dd>{catalogue}</dd>
          </div>
          <div className={styles.summaryRow}>
            <dt>Presenter Images</dt>
            <dd>{presenterShots}</dd>
          </div>
          <div className={styles.summaryRowTotal}>
            <dt>Total Images</dt>
            <dd>{assetTypes.length}</dd>
          </div>
        </dl>
      </div>

      {viewingPresenterId && viewingData && (
        <Modal title={viewingData.presenter.displayName} onClose={() => setViewingPresenterId(null)}>
          <p className={styles.modalStyle}>
            {viewingData.presenter.styleLabel} — supports{' '}
            {viewingData.presenter.supportedJewelleryTypes.join(', ')}
          </p>
          <div className={styles.referenceGrid}>
            <ReferenceTile label="Front Portrait" url={viewingData.presenter.frontPortraitUrl} />
            <ReferenceTile label="45° Face Angle" url={viewingData.presenter.face45Url} />
            <ReferenceTile label="Side Profile" url={viewingData.presenter.sideProfileUrl} />
            <ReferenceTile label="Jewellery Placement" url={viewingData.presenter.jewelleryPlacementUrl} />
          </div>
          <div className={styles.modalActions}>
            <button
              type="button"
              className={sharedStyles.buttonPrimary}
              onClick={() => {
                onChange(viewingData.presenter.id);
                setViewingPresenterId(null);
              }}
            >
              Select Presenter
            </button>
            <button type="button" className={sharedStyles.button} onClick={() => setViewingPresenterId(null)}>
              Close
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function ReferenceTile({ label, url }: { label: string; url: string }) {
  return (
    <div className={styles.referenceTile}>
      <img src={url} alt={label} className={styles.referenceImg} />
      <p className={styles.referenceLabel}>{label}</p>
    </div>
  );
}

function PresenterCard({
  presenter,
  selected,
  disabled,
  onSelect,
  onViewReferences,
}: {
  presenter: PresenterSummary;
  selected: boolean;
  disabled: boolean;
  onSelect: () => void;
  onViewReferences: () => void;
}) {
  const cardClass = disabled ? styles.cardDisabled : selected ? styles.cardSelected : styles.card;
  return (
    <div className={cardClass}>
      {selected && !disabled && <span className={styles.checkmark}>✓</span>}
      <button
        type="button"
        className={styles.cardImageButton}
        onClick={onSelect}
        disabled={disabled}
        aria-pressed={selected}
      >
        <img src={presenter.mainPreviewImageUrl} alt={presenter.displayName} className={styles.cardImage} />
      </button>
      <p className={styles.cardTitle}>{presenter.displayName}</p>
      <p className={styles.cardStyle}>{presenter.styleLabel}</p>
      <p className={styles.cardTypes}>{presenter.supportedJewelleryTypes.join(', ')}</p>
      {disabled ? (
        <p className={styles.notAvailable}>Not available for this jewellery type.</p>
      ) : (
        <div className={styles.cardFooter}>
          <label className={styles.radioLabel}>
            <input type="radio" name="presenter" checked={selected} onChange={onSelect} />
            Select
          </label>
          <button type="button" className={sharedStyles.buttonLink} onClick={onViewReferences}>
            View References
          </button>
        </div>
      )}
    </div>
  );
}
