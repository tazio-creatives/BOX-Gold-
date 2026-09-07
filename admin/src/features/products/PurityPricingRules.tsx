import { useEffect, useState } from 'react';
import type { Purity, PurityPricingRuleInput } from '../../api/types';
import styles from './ProductVariations.module.css';

interface PurityDraft {
  makingChargePercent: string;
  makingChargeDiscountPercent: string;
  diamondDiscountPercent: string;
}

const EMPTY_DRAFT: PurityDraft = { makingChargePercent: '', makingChargeDiscountPercent: '', diamondDiscountPercent: '' };

type Field = keyof PurityDraft;
const FIELDS: Field[] = ['makingChargePercent', 'makingChargeDiscountPercent', 'diamondDiscountPercent'];

const FIELD_LABEL: Record<Field, string> = {
  makingChargePercent: 'Making Charge (%)',
  makingChargeDiscountPercent: 'Making Discount (%)',
  diamondDiscountPercent: 'Diamond Discount (%)',
};

// Blank -> null (inherit); a valid "0"..."100" -> that number; anything else
// -> 'invalid'. Never coerced to 0 — a blank field must survive as null all
// the way to the save payload, or inheritance and an explicit 0% become
// indistinguishable.
function parsePercent(raw: string): number | null | 'invalid' {
  const trimmed = raw.trim();
  if (trimmed === '') return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n < 0 || n > 100) return 'invalid';
  return n;
}

function draftsFromValue(value: PurityPricingRuleInput[]) {
  const drafts: Record<string, PurityDraft> = {};
  for (const rule of value) {
    drafts[rule.purity] = {
      makingChargePercent: rule.makingChargePercent == null ? '' : String(rule.makingChargePercent),
      makingChargeDiscountPercent: rule.makingChargeDiscountPercent == null ? '' : String(rule.makingChargeDiscountPercent),
      diamondDiscountPercent: rule.diamondDiscountPercent == null ? '' : String(rule.diamondDiscountPercent),
    };
  }
  return drafts;
}

// Any field left invalid (out of range / not a number) is emitted as null
// (== "use default") rather than blocking every other field's live value —
// the invalid text stays visible with its own error, and Save Product's
// backend validation is the real gate that rejects the request outright if
// it's still invalid at submit time.
function valueFromDrafts(purities: Purity[], drafts: Record<string, PurityDraft>): PurityPricingRuleInput[] {
  return purities
    .map((p) => {
      const draft = drafts[p] ?? EMPTY_DRAFT;
      const makingChargePercent = parsePercent(draft.makingChargePercent);
      const makingChargeDiscountPercent = parsePercent(draft.makingChargeDiscountPercent);
      const diamondDiscountPercent = parsePercent(draft.diamondDiscountPercent);
      return {
        purity: p,
        makingChargePercent: makingChargePercent === 'invalid' ? null : makingChargePercent,
        makingChargeDiscountPercent: makingChargeDiscountPercent === 'invalid' ? null : makingChargeDiscountPercent,
        diamondDiscountPercent: diamondDiscountPercent === 'invalid' ? null : diamondDiscountPercent,
      };
    })
    .filter(
      (r) => r.makingChargePercent != null || r.makingChargeDiscountPercent != null || r.diamondDiscountPercent != null,
    );
}

interface PurityPricingRulesProps {
  purities: Purity[];
  productDefaults: {
    makingChargePercent: number | null;
    makingChargeDiscountPercent: number;
    diamondDiscountPercent: number;
  };
  value: PurityPricingRuleInput[];
  onChange: (_next: PurityPricingRuleInput[]) => void;
}

// Fully controlled — driven by `purities` (the product form's own unsaved
// selection) and `value`/`onChange` (the draft rule set held by
// ProductFormPage). No fetch, no save button, no product id required: shows
// up the instant a purity is picked, before the product has ever been
// saved.
export function PurityPricingRules({ purities, productDefaults, value, onChange }: PurityPricingRulesProps) {
  const [drafts, setDrafts] = useState<Record<string, PurityDraft>>({});
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const axisSignature = purities.join(',');

  // Same reconciliation strategy as WeightDefaults — seed from `value` once
  // per axis change, preserve whatever's already typed for a purity that's
  // still selected, drop drafts for a purity that was removed.
  useEffect(() => {
    const seeded = draftsFromValue(value);
    setDrafts((prev) => {
      const next: Record<string, PurityDraft> = {};
      for (const p of purities) next[p] = prev[p] ?? seeded[p] ?? EMPTY_DRAFT;
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [axisSignature]);

  function errorKey(purity: string, field: Field) {
    return `${purity}:${field}`;
  }

  function setField(purity: Purity, field: Field, raw: string) {
    const next = { ...drafts, [purity]: { ...(drafts[purity] ?? EMPTY_DRAFT), [field]: raw } };
    setDrafts(next);

    const parsed = parsePercent(raw);
    setFieldErrors((prev) => {
      const key = errorKey(purity, field);
      if (parsed === 'invalid') return { ...prev, [key]: 'Enter a number between 0 and 100, or leave blank.' };
      if (!(key in prev)) return prev;
      const rest = Object.fromEntries(Object.entries(prev).filter(([k]) => k !== key));
      return rest;
    });

    onChange(valueFromDrafts(purities, next));
  }

  // Fills every purity's draft with the product's own defaults, as plain
  // text in the inputs — a preview the admin can see and edit before Save
  // Product persists anything. Local draft state only: never calls an API,
  // never shows a saved-success message — final persistence happens only
  // through the one Save Product action.
  function copyDefaultsToAllPurities() {
    const next: Record<string, PurityDraft> = {};
    for (const p of purities) {
      next[p] = {
        makingChargePercent: productDefaults.makingChargePercent == null ? '' : String(productDefaults.makingChargePercent),
        makingChargeDiscountPercent: String(productDefaults.makingChargeDiscountPercent),
        diamondDiscountPercent: String(productDefaults.diamondDiscountPercent),
      };
    }
    setDrafts(next);
    setFieldErrors({});
    onChange(valueFromDrafts(purities, next));
  }

  if (purities.length === 0) return null;

  return (
    <div className={styles.rulesPanel}>
      <span className={styles.advancedTitle}>Purity Pricing Rules</span>
      <p className={styles.advancedSub} style={{ padding: 0, marginTop: 4 }}>
        Set making charges and discounts for each purity. Leave a field empty to use the product default. Saved
        together with the rest of the product when you click Save Product.
      </p>

      <div className={styles.purityDesktopTable}>
        <div className={styles.sizeTableWrap}>
          <table className={styles.sizeTable} style={{ marginTop: 12 }}>
            <thead>
              <tr>
                <th>Purity</th>
                <th>Making Charge %</th>
                <th>Making Discount %</th>
                <th>Diamond Discount %</th>
              </tr>
            </thead>
            <tbody>
              {purities.map((p) => {
                const draft = drafts[p] ?? EMPTY_DRAFT;
                return (
                  <tr key={p}>
                    <td>{p}</td>
                    {FIELDS.map((field) => (
                      <td key={field}>
                        <input
                          type="number"
                          min={0}
                          max={100}
                          step="0.01"
                          placeholder={`Default: ${
                            field === 'makingChargePercent'
                              ? (productDefaults.makingChargePercent ?? '—')
                              : field === 'makingChargeDiscountPercent'
                                ? productDefaults.makingChargeDiscountPercent
                                : productDefaults.diamondDiscountPercent
                          }%`}
                          value={draft[field]}
                          onChange={(e) => setField(p, field, e.target.value)}
                        />
                        {fieldErrors[errorKey(p, field)] && (
                          <div className={styles.fieldError}>{fieldErrors[errorKey(p, field)]}</div>
                        )}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className={styles.purityMobileCards}>
        {purities.map((p) => {
          const draft = drafts[p] ?? EMPTY_DRAFT;
          return (
            <div key={p} className={styles.purityCard}>
              <div className={styles.purityCardTitle}>{p} Pricing</div>
              <div className={styles.purityCardDefaults}>
                Default references:
                <br />
                Making Charge: {productDefaults.makingChargePercent ?? '—'}%<br />
                Making Discount: {productDefaults.makingChargeDiscountPercent}%<br />
                Diamond Discount: {productDefaults.diamondDiscountPercent}%
              </div>
              {FIELDS.map((field) => (
                <div key={field} className={styles.purityCardField}>
                  <label htmlFor={`${p}-${field}`}>{FIELD_LABEL[field]}</label>
                  <input
                    id={`${p}-${field}`}
                    type="number"
                    min={0}
                    max={100}
                    step="0.01"
                    placeholder="Use Default"
                    value={draft[field]}
                    onChange={(e) => setField(p, field, e.target.value)}
                  />
                  {fieldErrors[errorKey(p, field)] && (
                    <div className={styles.fieldError}>{fieldErrors[errorKey(p, field)]}</div>
                  )}
                </div>
              ))}
            </div>
          );
        })}
      </div>

      <div style={{ marginTop: 12, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10 }}>
        <button type="button" className={styles.chevronBtn} style={{ width: 'auto', padding: '0 14px' }} onClick={copyDefaultsToAllPurities}>
          Copy Defaults to All Purities
        </button>
      </div>
    </div>
  );
}
