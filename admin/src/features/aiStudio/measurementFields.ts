import type { JewelleryType } from '../../api/aiStudio';

// TS mirror of backend/src/validators/productSizeMeasurements.validators.js
// — same field keys/labels/categories, kept in lockstep since both the form
// here and the backend's save/generate validation need the identical
// per-category shape (same convention as generationRules.ts mirroring
// aiStudioService.js elsewhere in this file).
export interface MeasurementField {
  key: string;
  label: string;
  type: 'number' | 'text';
}

const CATEGORY_MEASUREMENT_FIELDS: Partial<Record<JewelleryType, MeasurementField[]>> = {
  RING: [
    { key: 'ringTopWidth', label: 'Ring-top width', type: 'number' },
    { key: 'ringTopHeight', label: 'Ring-top height', type: 'number' },
    { key: 'bandWidth', label: 'Band width', type: 'number' },
    { key: 'innerDiameter', label: 'Inner diameter', type: 'number' },
    { key: 'ringSize', label: 'Ring size', type: 'text' },
  ],
  PENDANT: [
    { key: 'pendantBodyWidth', label: 'Pendant width', type: 'number' },
    { key: 'pendantBodyHeight', label: 'Pendant height (loop included)', type: 'number' },
  ],
  EARRINGS: [
    { key: 'earringWidth', label: 'Earring width', type: 'number' },
    { key: 'earringHeight', label: 'Earring height', type: 'number' },
    { key: 'dropLength', label: 'Drop length', type: 'number' },
  ],
  BANGLE: [
    { key: 'innerDiameter', label: 'Inner diameter', type: 'number' },
    { key: 'outerDiameter', label: 'Outer diameter', type: 'number' },
    { key: 'bandWidth', label: 'Band width', type: 'number' },
    { key: 'thickness', label: 'Product thickness', type: 'number' },
  ],
  BRACELET: [
    { key: 'braceletLength', label: 'Bracelet length', type: 'number' },
    { key: 'braceletWidth', label: 'Bracelet width', type: 'number' },
    { key: 'thickness', label: 'Product thickness', type: 'number' },
  ],
  NECKLACE: [
    { key: 'totalLength', label: 'Total length', type: 'number' },
    { key: 'pendantWidth', label: 'Pendant width', type: 'number' },
    { key: 'pendantHeight', label: 'Pendant height', type: 'number' },
  ],
};
CATEGORY_MEASUREMENT_FIELDS.CHAIN = CATEGORY_MEASUREMENT_FIELDS.NECKLACE;

const GENERIC_MEASUREMENT_FIELDS: MeasurementField[] = [
  { key: 'productWidth', label: 'Product width', type: 'number' },
  { key: 'productHeight', label: 'Product height', type: 'number' },
  { key: 'productLength', label: 'Product length', type: 'number' },
  { key: 'productDiameter', label: 'Product diameter', type: 'number' },
  { key: 'innerDiameter', label: 'Inner diameter', type: 'number' },
  { key: 'bandWidth', label: 'Band width', type: 'number' },
  { key: 'thickness', label: 'Product thickness', type: 'number' },
];

export function fieldsForCategory(jewelleryType: JewelleryType | ''): MeasurementField[] {
  if (!jewelleryType) return GENERIC_MEASUREMENT_FIELDS;
  return CATEGORY_MEASUREMENT_FIELDS[jewelleryType] ?? GENERIC_MEASUREMENT_FIELDS;
}

export interface InclusionRule {
  part: string;
  label: string;
  partHeightKey?: string;
  wholeHeightKey?: string;
}

const INCLUSION_RULES: Partial<Record<JewelleryType, InclusionRule>> = {
  PENDANT: { part: 'loop', label: 'Loop' },
  NECKLACE: { part: 'loop', label: 'Loop' },
  CHAIN: { part: 'loop', label: 'Loop' },
  EARRINGS: { part: 'hook', label: 'Hook' },
  BRACELET: { part: 'clasp', label: 'Clasp' },
};

export function inclusionRuleFor(jewelleryType: JewelleryType | ''): InclusionRule | null {
  if (!jewelleryType) return null;
  return INCLUSION_RULES[jewelleryType] ?? null;
}
