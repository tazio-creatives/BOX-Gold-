import { AppError } from '../utils/AppError.js';

// Single source of truth for which fields the Manual Measurements form
// shows per confirmed jewellery type (plan: "Show only fields relevant to
// the confirmed category") — mirrored in the admin TS UI
// (admin/src/features/aiStudio/measurementFields.ts) since the form itself
// needs the same config to render inputs; kept here as the source backend
// validation is checked against.
export const CATEGORY_MEASUREMENT_FIELDS = {
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

// Fallback for any jewellery type the spec didn't give an explicit field
// list for (Bracelet/Anklet/Nose Pin/Mangalsutra/Brooch/Other etc use this
// too where not already covered above) — the spec's own "Common fields"
// vocabulary.
export const GENERIC_MEASUREMENT_FIELDS = [
  { key: 'productWidth', label: 'Product width', type: 'number' },
  { key: 'productHeight', label: 'Product height', type: 'number' },
  { key: 'productLength', label: 'Product length', type: 'number' },
  { key: 'productDiameter', label: 'Product diameter', type: 'number' },
  { key: 'innerDiameter', label: 'Inner diameter', type: 'number' },
  { key: 'bandWidth', label: 'Band width', type: 'number' },
  { key: 'thickness', label: 'Product thickness', type: 'number' },
];

export function fieldsForCategory(jewelleryType) {
  return CATEGORY_MEASUREMENT_FIELDS[jewelleryType] ?? GENERIC_MEASUREMENT_FIELDS;
}

// Which saved fields represent the piece's overall photographed width/height
// — used both to derive the ruler's px-per-unit scale and to cross-check the
// generated photo's detected proportions (productSizeImageService.js). Some
// categories only have one true overall dimension (a Bangle/Bracelet/chain's
// "shape" isn't meaningfully width x height) — heightKey is null there, and
// the aspect-ratio cross-check is skipped entirely for that product (see
// checkAspectRatioAgreement's own "only when both are declared" guard).
const PRIMARY_DIMENSIONS = {
  RING: { widthKey: 'ringTopWidth', heightKey: 'ringTopHeight' },
  // heightKey is the whole visible piece (loop included) — it's what's
  // actually in the photo, so it's what the aspect-ratio fidelity check and
  // the ruler scale must be built from. There's deliberately no separate
  // "total height" field any more (see INCLUSION_RULES.PENDANT below).
  PENDANT: { widthKey: 'pendantBodyWidth', heightKey: 'pendantBodyHeight' },
  EARRINGS: { widthKey: 'earringWidth', heightKey: 'dropLength' },
  BANGLE: { widthKey: 'outerDiameter', heightKey: null },
  BRACELET: { widthKey: 'braceletLength', heightKey: null },
  NECKLACE: { widthKey: 'totalLength', heightKey: null },
  CHAIN: { widthKey: 'totalLength', heightKey: null },
};

export function primaryDimensionsFor(jewelleryType, measurements) {
  const config = PRIMARY_DIMENSIONS[jewelleryType] ?? { widthKey: 'productWidth', heightKey: 'productHeight' };
  const widthValue = measurements[config.widthKey];
  const heightValue = config.heightKey ? measurements[config.heightKey] : null;
  return {
    widthValue: typeof widthValue === 'number' ? widthValue : null,
    heightValue: typeof heightValue === 'number' ? heightValue : null,
  };
}

// Category -> which "part" can be included/excluded, and (only for Pendant,
// where the spec gives both a part-only and a whole-piece field) the pair of
// saved measurement keys the proportional exclusion-boundary math in
// productSizeImageService.js divides against each other. Categories without
// a partHeightKey/wholeHeightKey still require the included/excluded choice
// (plan: "require an inclusion/exclusion selection when the product contains
// a loop, hook or clasp") but the rendered image shows only the
// included/excluded text note for them, not a separate dashed boundary line
// — there is no admin-entered part-vs-whole pair to draw one from.
export const INCLUSION_RULES = {
  // No partHeightKey/wholeHeightKey here any more — there's only one height
  // field now (see PRIMARY_DIMENSIONS.PENDANT above), so "Loop excluded"
  // is informational only, same as every other category below: it labels
  // the piece in the rendered image, but there's no separate body-only
  // number to compute a proportional boundary line from.
  PENDANT: { part: 'loop', label: 'Loop' },
  NECKLACE: { part: 'loop', label: 'Loop' },
  CHAIN: { part: 'loop', label: 'Loop' },
  EARRINGS: { part: 'hook', label: 'Hook' },
  BRACELET: { part: 'clasp', label: 'Clasp' },
};

function isValidNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 && Math.round(value * 100) === value * 100;
}

// Runs on both PUT (save) and POST (save-then-generate) — save-without-
// generating still needs to reject garbage data, just without requiring
// every field an eventual generation would need.
export function validateMeasurementsInput({ jewelleryType, unit, measurements, includedParts, excludedParts }) {
  if (unit !== 'mm' && unit !== 'cm') {
    throw new AppError(400, 'Select the measurement unit.');
  }

  const fields = fieldsForCategory(jewelleryType);
  const numberFields = fields.filter((f) => f.type === 'number');
  const providedNumberEntries = numberFields.filter((f) => measurements[f.key] != null && measurements[f.key] !== '');

  if (providedNumberEntries.length === 0) {
    throw new AppError(400, 'Enter at least one measurement.');
  }

  for (const field of providedNumberEntries) {
    const value = measurements[field.key];
    if (!isValidNumber(value)) {
      throw new AppError(400, `Enter a valid ${field.label.toLowerCase()}.`);
    }
  }

  const inclusionRule = INCLUSION_RULES[jewelleryType];
  if (inclusionRule) {
    const isIncluded = (includedParts ?? []).includes(inclusionRule.part);
    const isExcluded = (excludedParts ?? []).includes(inclusionRule.part);
    if (!isIncluded && !isExcluded) {
      throw new AppError(400, `Choose whether the ${inclusionRule.label.toLowerCase()} is included.`);
    }
    if (isIncluded && isExcluded) {
      throw new AppError(400, `The ${inclusionRule.label.toLowerCase()} cannot be both included and excluded.`);
    }
    if (isExcluded && inclusionRule.partHeightKey && inclusionRule.wholeHeightKey) {
      const partValue = measurements[inclusionRule.partHeightKey];
      const wholeValue = measurements[inclusionRule.wholeHeightKey];
      if (!isValidNumber(partValue) || !isValidNumber(wholeValue)) {
        throw new AppError(
          400,
          `Enter both the body height and the total height to exclude the ${inclusionRule.label.toLowerCase()}.`,
        );
      }
      if (partValue >= wholeValue) {
        throw new AppError(400, 'Body height must be smaller than total height.');
      }
    }
  }
}
