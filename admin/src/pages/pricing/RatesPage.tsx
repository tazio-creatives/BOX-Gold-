import { useState } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { fetchGoldRates } from '../../api/pricing';
import {
  fetchDiamondConfigs,
  createDiamondConfig,
  updateDiamondConfig,
  deleteDiamondConfig,
} from '../../api/diamondConfigs';
import { fetchDiamondTypes, createDiamondType, updateDiamondType } from '../../api/diamondTypes';
import { DiamondConfigForm } from '../../features/pricing/DiamondConfigForm';
import { DiamondTypeForm } from '../../features/pricing/DiamondTypeForm';
import { GoldRateSettingsPanel } from '../../features/pricing/GoldRateSettingsPanel';
import type { DiamondConfig, DiamondType } from '../../api/types';
import { ApiError } from '../../api/client';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import sharedStyles from '../../styles/shared.module.css';
import styles from './RatesPage.module.css';

const PURITY_ORDER = ['24K', '22K', '18K', '14K', '9K'];

type DiamondConfigMode = { type: 'none' } | { type: 'add' } | { type: 'edit'; config: DiamondConfig };
type DiamondTypeMode = { type: 'none' } | { type: 'add' } | { type: 'edit'; diamondType: DiamondType };

function formatRate(value: string | number): string {
  return `₹${Number(value).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
}

// Was PricingPage.tsx (the whole /pricing route) before Pricing Rule
// Management introduced tabs — now just the "Rates & Tiers" tab, with a new
// Diamond Types section added (the master list Diamond Discount Rules pick
// from — see pricing.module.css / PricingLayout.tsx for the tab shell).
export function RatesPage() {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [showGoldHistory, setShowGoldHistory] = useState(false);
  const [diamondConfigMode, setDiamondConfigMode] = useState<DiamondConfigMode>({ type: 'none' });
  const [pendingConfigDelete, setPendingConfigDelete] = useState<DiamondConfig | null>(null);
  const [diamondTypeMode, setDiamondTypeMode] = useState<DiamondTypeMode>({ type: 'none' });

  const { data: goldData, isLoading: isGoldLoading } = useQuery({
    queryKey: ['admin-gold-rates'],
    queryFn: fetchGoldRates,
  });

  const { data: diamondConfigData, isLoading: isDiamondConfigLoading } = useQuery({
    queryKey: ['admin-diamond-configs'],
    queryFn: () => fetchDiamondConfigs(),
  });

  const { data: diamondTypeData, isLoading: isDiamondTypeLoading } = useQuery({
    queryKey: ['admin-diamond-types'],
    queryFn: () => fetchDiamondTypes(),
  });

  const invalidateDiamondConfigs = () => queryClient.invalidateQueries({ queryKey: ['admin-diamond-configs'] });
  const invalidateDiamondTypes = () => queryClient.invalidateQueries({ queryKey: ['admin-diamond-types'] });

  const createDiamondConfigMutation = useMutation({
    mutationFn: createDiamondConfig,
    onSuccess: () => {
      invalidateDiamondConfigs();
      setDiamondConfigMode({ type: 'none' });
    },
  });
  const updateDiamondConfigMutation = useMutation({
    mutationFn: ({ id, input }: { id: string; input: Parameters<typeof updateDiamondConfig>[1] }) =>
      updateDiamondConfig(id, input),
    onSuccess: () => {
      invalidateDiamondConfigs();
      setDiamondConfigMode({ type: 'none' });
    },
  });
  const deleteDiamondConfigMutation = useMutation({
    mutationFn: deleteDiamondConfig,
    onSuccess: () => {
      invalidateDiamondConfigs();
      setPendingConfigDelete(null);
    },
    onError: (err) => {
      setError(err instanceof ApiError ? err.message : 'Could not delete diamond quality tier.');
      setPendingConfigDelete(null);
    },
  });

  const createDiamondTypeMutation = useMutation({
    mutationFn: createDiamondType,
    onSuccess: () => {
      invalidateDiamondTypes();
      setDiamondTypeMode({ type: 'none' });
    },
  });
  const updateDiamondTypeMutation = useMutation({
    mutationFn: ({ id, input }: { id: string; input: Parameters<typeof updateDiamondType>[1] }) =>
      updateDiamondType(id, input),
    onSuccess: () => {
      invalidateDiamondTypes();
      setDiamondTypeMode({ type: 'none' });
    },
  });

  const goldRates = [...(goldData?.current ?? [])].sort(
    (a, b) => PURITY_ORDER.indexOf(a.purity) - PURITY_ORDER.indexOf(b.purity),
  );
  const diamondConfigs = diamondConfigData?.diamondConfigs ?? [];
  const diamondTypes = diamondTypeData?.diamondTypes ?? [];

  return (
    <div>
      {error && <p className={sharedStyles.error}>{error}</p>}

      <section className={sharedStyles.cardPadded}>
        <div className={styles.sectionHeader}>
          <div>
            <h2 className={styles.sectionHeading}>Gold Rates</h2>
            <p className={styles.sectionSubtext}>
              Sourced automatically from OroPocket every 15 minutes (GoldAPI as temporary fallback) — products
              auto-recalculate whenever the effective rate changes (unless price-locked).
            </p>
          </div>
        </div>

        <GoldRateSettingsPanel />

        {isGoldLoading && <p className={sharedStyles.empty}>Loading…</p>}
        {!isGoldLoading && goldRates.length === 0 && (
          <p className={sharedStyles.empty}>No gold rates yet — click "Sync Now" to fetch the first one.</p>
        )}
        {goldRates.length > 0 && (
          <table className={sharedStyles.table}>
            <thead>
              <tr>
                <th>Purity</th>
                <th>Rate / gram</th>
                <th>Source</th>
                <th>Last Synced</th>
              </tr>
            </thead>
            <tbody>
              {goldRates.map((rate) => (
                <tr key={rate.id}>
                  <td>{rate.purity}</td>
                  <td>{formatRate(rate.rate_per_gram)}</td>
                  <td>{rate.source}</td>
                  <td>{formatDateTime(rate.fetched_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {(goldData?.history.length ?? 0) > 0 && (
          <>
            <button type="button" className={sharedStyles.buttonLink} onClick={() => setShowGoldHistory((v) => !v)}>
              {showGoldHistory ? 'Hide history' : 'Show rate history'}
            </button>
            {showGoldHistory && (
              <table className={`${sharedStyles.table} ${styles.historyTable}`}>
                <thead>
                  <tr>
                    <th>Purity</th>
                    <th>Rate / gram</th>
                    <th>Source</th>
                    <th>Fetched</th>
                  </tr>
                </thead>
                <tbody>
                  {goldData?.history.map((rate) => (
                    <tr key={rate.id}>
                      <td>{rate.purity}</td>
                      <td>{formatRate(rate.rate_per_gram)}</td>
                      <td>{rate.source}</td>
                      <td>{formatDateTime(rate.fetched_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </>
        )}
      </section>

      <section className={`${sharedStyles.cardPadded} ${styles.section}`}>
        <div className={styles.sectionHeader}>
          <div>
            <h2 className={styles.sectionHeading}>Diamond Quality Tiers</h2>
            <p className={styles.sectionSubtext}>
              Manual rate per cent, by quality — no live feed. A product picks one tier; products on that
              tier auto-recalculate when its rate changes (unless price-locked).
            </p>
          </div>
          {diamondConfigMode.type === 'none' && (
            <button
              type="button"
              className={sharedStyles.buttonPrimary}
              onClick={() => setDiamondConfigMode({ type: 'add' })}
            >
              Add Tier
            </button>
          )}
        </div>

        {diamondConfigMode.type === 'add' && (
          <div className={styles.formWrapper}>
            <DiamondConfigForm
              onSubmit={(input) => createDiamondConfigMutation.mutateAsync(input)}
              onCancel={() => setDiamondConfigMode({ type: 'none' })}
            />
          </div>
        )}
        {diamondConfigMode.type === 'edit' && (
          <div className={styles.formWrapper}>
            <DiamondConfigForm
              initial={diamondConfigMode.config}
              onSubmit={(input) => updateDiamondConfigMutation.mutateAsync({ id: diamondConfigMode.config.id, input })}
              onCancel={() => setDiamondConfigMode({ type: 'none' })}
            />
          </div>
        )}

        {isDiamondConfigLoading && <p className={sharedStyles.empty}>Loading…</p>}
        {!isDiamondConfigLoading && diamondConfigs.length === 0 && (
          <p className={sharedStyles.empty}>No diamond quality tiers yet — add one to get started.</p>
        )}
        {diamondConfigs.length > 0 && (
          <table className={sharedStyles.table}>
            <thead>
              <tr>
                <th>Name</th>
                <th>Rate / cent</th>
                <th>Status</th>
                <th>Updated</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {diamondConfigs.map((config) => (
                <tr key={config.id}>
                  <td>{config.name}</td>
                  <td>{formatRate(config.ratePerCent)}</td>
                  <td>
                    <span className={config.isActive ? sharedStyles.badgeSuccess : sharedStyles.badgeNeutral}>
                      {config.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td>{formatDateTime(config.updatedAt)}</td>
                  <td className={styles.rowActions}>
                    <button
                      type="button"
                      className={sharedStyles.buttonLink}
                      onClick={() => setDiamondConfigMode({ type: 'edit', config })}
                    >
                      Edit
                    </button>
                    <button type="button" className={sharedStyles.buttonLink} onClick={() => setPendingConfigDelete(config)}>
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className={`${sharedStyles.cardPadded} ${styles.section}`}>
        <div className={styles.sectionHeader}>
          <div>
            <h2 className={styles.sectionHeading}>Diamond Types</h2>
            <p className={styles.sectionSubtext}>
              The master list Diamond Discount Rules select from (e.g. "Natural", "Lab-Grown") — separate from
              Quality Tiers above, which price by rate rather than identify a type. Existing products keep working
              from their free-text type until edited; a type can be deactivated but not deleted once it's in use.
            </p>
          </div>
          {diamondTypeMode.type === 'none' && (
            <button
              type="button"
              className={sharedStyles.buttonPrimary}
              onClick={() => setDiamondTypeMode({ type: 'add' })}
            >
              Add Diamond Type
            </button>
          )}
        </div>

        {diamondTypeMode.type === 'add' && (
          <div className={styles.formWrapper}>
            <DiamondTypeForm
              onSubmit={(input) => createDiamondTypeMutation.mutateAsync(input)}
              onCancel={() => setDiamondTypeMode({ type: 'none' })}
            />
          </div>
        )}
        {diamondTypeMode.type === 'edit' && (
          <div className={styles.formWrapper}>
            <DiamondTypeForm
              initial={diamondTypeMode.diamondType}
              onSubmit={(input) =>
                updateDiamondTypeMutation.mutateAsync({ id: diamondTypeMode.diamondType.id, input })
              }
              onCancel={() => setDiamondTypeMode({ type: 'none' })}
            />
          </div>
        )}

        {isDiamondTypeLoading && <p className={sharedStyles.empty}>Loading…</p>}
        {!isDiamondTypeLoading && diamondTypes.length === 0 && (
          <p className={sharedStyles.empty}>No diamond types yet — add one before creating a Diamond Discount Rule.</p>
        )}
        {diamondTypes.length > 0 && (
          <table className={sharedStyles.table}>
            <thead>
              <tr>
                <th>Name</th>
                <th>Status</th>
                <th>Updated</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {diamondTypes.map((diamondType) => (
                <tr key={diamondType.id}>
                  <td>{diamondType.name}</td>
                  <td>
                    <span className={diamondType.isActive ? sharedStyles.badgeSuccess : sharedStyles.badgeNeutral}>
                      {diamondType.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td>{formatDateTime(diamondType.updatedAt)}</td>
                  <td className={styles.rowActions}>
                    <button
                      type="button"
                      className={sharedStyles.buttonLink}
                      onClick={() => setDiamondTypeMode({ type: 'edit', diamondType })}
                    >
                      Edit
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {pendingConfigDelete && (
        <ConfirmDialog
          title="Delete diamond quality tier"
          message={`Delete "${pendingConfigDelete.name}"? This cannot be undone.`}
          isPending={deleteDiamondConfigMutation.isPending}
          onConfirm={() => deleteDiamondConfigMutation.mutate(pendingConfigDelete.id)}
          onCancel={() => setPendingConfigDelete(null)}
        />
      )}
    </div>
  );
}
