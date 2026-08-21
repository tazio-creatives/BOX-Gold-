import { useState } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { fetchGoldRates, syncGoldRates } from '../api/pricing';
import {
  fetchDiamondConfigs,
  createDiamondConfig,
  updateDiamondConfig,
  deleteDiamondConfig,
} from '../api/diamondConfigs';
import { DiamondConfigForm } from '../features/pricing/DiamondConfigForm';
import type { DiamondConfig } from '../api/types';
import { ApiError } from '../api/client';
import { ConfirmDialog } from '../components/ConfirmDialog';
import sharedStyles from '../styles/shared.module.css';
import styles from './PricingPage.module.css';

const PURITY_ORDER = ['24K', '22K', '18K', '14K', '9K'];

type DiamondMode = { type: 'none' } | { type: 'add' } | { type: 'edit'; config: DiamondConfig };

function formatRate(value: string | number): string {
  return `₹${Number(value).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
}

export function PricingPage() {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [showGoldHistory, setShowGoldHistory] = useState(false);
  const [diamondMode, setDiamondMode] = useState<DiamondMode>({ type: 'none' });
  const [pendingDelete, setPendingDelete] = useState<DiamondConfig | null>(null);

  const { data: goldData, isLoading: isGoldLoading } = useQuery({
    queryKey: ['admin-gold-rates'],
    queryFn: fetchGoldRates,
  });

  const { data: diamondData, isLoading: isDiamondLoading } = useQuery({
    queryKey: ['admin-diamond-configs'],
    queryFn: () => fetchDiamondConfigs(),
  });

  const syncMutation = useMutation({
    mutationFn: syncGoldRates,
    onSuccess: () => {
      setError(null);
      // The sync runs in a background job — the rows won't reflect the new
      // rate the instant this call returns, only that it's been queued.
      // Give the worker a moment, then refetch so fetched_at proves whether
      // it landed yet (retry "Sync Now" if it hasn't).
      setTimeout(() => queryClient.invalidateQueries({ queryKey: ['admin-gold-rates'] }), 2500);
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Could not start gold rate sync.'),
  });

  const invalidateDiamondConfigs = () => queryClient.invalidateQueries({ queryKey: ['admin-diamond-configs'] });

  const createDiamondMutation = useMutation({
    mutationFn: createDiamondConfig,
    onSuccess: () => {
      invalidateDiamondConfigs();
      setDiamondMode({ type: 'none' });
    },
  });

  const updateDiamondMutation = useMutation({
    mutationFn: ({ id, input }: { id: string; input: Parameters<typeof updateDiamondConfig>[1] }) =>
      updateDiamondConfig(id, input),
    onSuccess: () => {
      invalidateDiamondConfigs();
      setDiamondMode({ type: 'none' });
    },
  });

  const deleteDiamondMutation = useMutation({
    mutationFn: deleteDiamondConfig,
    onSuccess: () => {
      invalidateDiamondConfigs();
      setPendingDelete(null);
    },
    onError: (err) => {
      setError(err instanceof ApiError ? err.message : 'Could not delete diamond quality tier.');
      setPendingDelete(null);
    },
  });

  const goldRates = [...(goldData?.current ?? [])].sort(
    (a, b) => PURITY_ORDER.indexOf(a.purity) - PURITY_ORDER.indexOf(b.purity),
  );
  const diamondConfigs = diamondData?.diamondConfigs ?? [];

  return (
    <div>
      <div className={sharedStyles.pageHeader}>
        <h1 className={sharedStyles.pageTitle}>Pricing</h1>
      </div>

      {error && <p className={sharedStyles.error}>{error}</p>}

      <section className={sharedStyles.cardPadded}>
        <div className={styles.sectionHeader}>
          <div>
            <h2 className={styles.sectionHeading}>Gold Rates</h2>
            <p className={styles.sectionSubtext}>
              Live rate per gram by purity — products auto-recalculate whenever this updates (unless
              price-locked).
            </p>
          </div>
          <button
            type="button"
            className={sharedStyles.buttonPrimary}
            disabled={syncMutation.isPending}
            onClick={() => syncMutation.mutate()}
          >
            {syncMutation.isPending ? 'Syncing…' : 'Sync Now'}
          </button>
        </div>

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
          {diamondMode.type === 'none' && (
            <button
              type="button"
              className={sharedStyles.buttonPrimary}
              onClick={() => setDiamondMode({ type: 'add' })}
            >
              Add Tier
            </button>
          )}
        </div>

        {diamondMode.type === 'add' && (
          <div className={styles.formWrapper}>
            <DiamondConfigForm
              onSubmit={(input) => createDiamondMutation.mutateAsync(input)}
              onCancel={() => setDiamondMode({ type: 'none' })}
            />
          </div>
        )}
        {diamondMode.type === 'edit' && (
          <div className={styles.formWrapper}>
            <DiamondConfigForm
              initial={diamondMode.config}
              onSubmit={(input) => updateDiamondMutation.mutateAsync({ id: diamondMode.config.id, input })}
              onCancel={() => setDiamondMode({ type: 'none' })}
            />
          </div>
        )}

        {isDiamondLoading && <p className={sharedStyles.empty}>Loading…</p>}
        {!isDiamondLoading && diamondConfigs.length === 0 && (
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
                      onClick={() => setDiamondMode({ type: 'edit', config })}
                    >
                      Edit
                    </button>
                    <button type="button" className={sharedStyles.buttonLink} onClick={() => setPendingDelete(config)}>
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {pendingDelete && (
        <ConfirmDialog
          title="Delete diamond quality tier"
          message={`Delete "${pendingDelete.name}"? This cannot be undone.`}
          isPending={deleteDiamondMutation.isPending}
          onConfirm={() => deleteDiamondMutation.mutate(pendingDelete.id)}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </div>
  );
}
