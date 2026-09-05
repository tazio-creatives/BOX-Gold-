import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError } from '../../api/client';
import { fetchWeightRules, replaceWeightRules, type WeightRule } from '../../api/weightRules';
import type { ProductAttributeGroup, Purity } from '../../api/types';
import styles from './ProductVariations.module.css';

function draftsFromRules(rules: WeightRule[]) {
  const purityDrafts: Record<string, string> = {};
  const matrixDrafts: Record<string, string> = {};
  for (const rule of rules) {
    if (rule.sizeLabel == null) {
      purityDrafts[rule.purity] = String(rule.goldWeightGrams);
    } else {
      matrixDrafts[`${rule.purity}|${rule.sizeLabel}`] = String(rule.goldWeightGrams);
    }
  }
  return { purityDrafts, matrixDrafts };
}

interface WeightDefaultsProps {
  productId: string;
  attributes: ProductAttributeGroup[];
}

// Weight resolution hierarchy — lets an admin declare "this weighs
// differently at this purity" and/or "...at this purity + size" as live
// defaults, without hand-editing every exact combination. Priority, most
// specific wins: a Purity+Size default here > a Purity-only default here >
// a combination's own legacy weight (set in Advanced Variant Management, or
// seeded from the old Size-level weight field) > the product's base weight.
// These rules are the authoritative source once set — saving here always
// takes effect immediately, even for combinations that already have their
// own stored weight. Only shown once the product has at least one Purity
// configured — nothing to build a default from otherwise.
export function WeightDefaults({ productId, attributes }: WeightDefaultsProps) {
  const queryClient = useQueryClient();
  const purities = (attributes.find((a) => a.code === 'purity')?.values ?? []) as {
    id: string;
    value: string;
    label: string;
  }[];
  const sizes = attributes.find((a) => a.code === 'size')?.values ?? [];

  const { data } = useQuery({
    queryKey: ['admin-weight-rules', productId],
    queryFn: () => fetchWeightRules(productId),
    enabled: purities.length > 0,
  });

  const [purityDrafts, setPurityDrafts] = useState<Record<string, string>>({});
  const [matrixDrafts, setMatrixDrafts] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!data) return;
    const { purityDrafts: nextPurity, matrixDrafts: nextMatrix } = draftsFromRules(data.rules);
    setPurityDrafts(nextPurity);
    setMatrixDrafts(nextMatrix);
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: () => {
      const purityRules = Object.entries(purityDrafts)
        .filter(([, v]) => v.trim() !== '')
        .map(([purity, v]) => ({ purity: purity as Purity, goldWeightGrams: Number(v) }));
      const puritySizeRules = Object.entries(matrixDrafts)
        .filter(([, v]) => v.trim() !== '')
        .map(([key, v]) => {
          const [purity, sizeLabel] = key.split('|');
          return { purity: purity as Purity, sizeLabel, goldWeightGrams: Number(v) };
        });
      return replaceWeightRules(productId, { purityRules, puritySizeRules });
    },
    // Only fires once the server has responded — the mutation promise
    // doesn't resolve until the PUT completes, so there's no way for this to
    // show before the transaction committed. The response carries the
    // freshly-saved rules straight from the DB (adminReplaceWeightRules
    // re-queries after commit), so drafts are replaced from that directly
    // rather than waiting on the invalidated queries to refetch — no gap
    // where the form could still show what was typed instead of what saved.
    onSuccess: (response) => {
      const { purityDrafts: nextPurity, matrixDrafts: nextMatrix } = draftsFromRules(response.rules);
      setPurityDrafts(nextPurity);
      setMatrixDrafts(nextMatrix);
      queryClient.invalidateQueries({ queryKey: ['admin-weight-rules', productId] });
      queryClient.invalidateQueries({ queryKey: ['admin-product-variants', productId] });
      queryClient.invalidateQueries({ queryKey: ['admin-product', productId] });
    },
  });

  const saveError = saveMutation.error instanceof ApiError ? saveMutation.error.message : null;

  if (purities.length === 0) return null;

  return (
    <div className={styles.rulesPanel}>
      <span className={styles.advancedTitle}>Weight Defaults</span>
      <p className={styles.advancedSub} style={{ padding: 0, marginTop: 4 }}>
        Set how gold weight changes by purity, or by purity + size. These rules are authoritative — saving here
        updates the live weight and price immediately, even for combinations that already have their own weight set
        elsewhere.
      </p>

      <table className={styles.sizeTable} style={{ marginTop: 12 }}>
        <thead>
          <tr>
            <th>Purity</th>
            <th>Gold Weight (g)</th>
          </tr>
        </thead>
        <tbody>
          {purities.map((p) => (
            <tr key={p.id}>
              <td>{p.label}</td>
              <td>
                <input
                  type="number"
                  min={0}
                  step="0.001"
                  placeholder="uses base weight"
                  value={purityDrafts[p.value] ?? ''}
                  onChange={(e) => setPurityDrafts((prev) => ({ ...prev, [p.value]: e.target.value }))}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {sizes.length > 0 && (
        <>
          <p className={styles.attrLabel} style={{ marginTop: 16, marginBottom: 8 }}>
            By Purity + Size
          </p>
          <div className={styles.sizeTableWrap}>
            <table className={styles.sizeTable}>
              <thead>
                <tr>
                  <th>Size</th>
                  {purities.map((p) => (
                    <th key={p.id}>{p.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sizes.map((s) => (
                  <tr key={s.id}>
                    <td>{s.label}</td>
                    {purities.map((p) => {
                      const key = `${p.value}|${s.value}`;
                      return (
                        <td key={p.id}>
                          <input
                            type="number"
                            min={0}
                            step="0.001"
                            placeholder="—"
                            value={matrixDrafts[key] ?? ''}
                            onChange={(e) => setMatrixDrafts((prev) => ({ ...prev, [key]: e.target.value }))}
                          />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <div style={{ marginTop: 12 }}>
        <button type="button" className={styles.ruleAddBtn} disabled={saveMutation.isPending} onClick={() => saveMutation.mutate()}>
          {saveMutation.isPending ? 'Saving…' : 'Save Weight Defaults'}
        </button>
        {saveMutation.isSuccess && (
          <span className={styles.emptyNote} style={{ marginLeft: 10 }}>
            Purity and size weights updated successfully.
          </span>
        )}
        {saveError && (
          <span style={{ marginLeft: 10, color: '#7a1733' }}>
            {saveError}
          </span>
        )}
      </div>
    </div>
  );
}
