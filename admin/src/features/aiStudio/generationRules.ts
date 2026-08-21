import type { AssetType, JewelleryType } from '../../api/aiStudio';

// Best-effort keyword match from a free-text product category name (e.g.
// "Diamond Rings", "Rose Gold Bangle") to the fixed jewellery-type
// vocabulary — categories in this app aren't constrained to that vocabulary,
// so this is advisory only; the admin can always override via "Update
// Product Category" regardless of what this infers.
export function inferJewelleryTypeFromCategory(categoryName: string | null): JewelleryType | null {
  if (!categoryName) return null;
  const normalized = categoryName.toUpperCase();
  const candidates: [JewelleryType, string[]][] = [
    ['MANGALSUTRA', ['MANGALSUTRA']],
    ['NOSE_PIN', ['NOSE PIN', 'NOSEPIN']],
    ['BANGLE', ['BANGLE']],
    ['BRACELET', ['BRACELET']],
    ['NECKLACE', ['NECKLACE']],
    ['EARRINGS', ['EARRING']],
    ['PENDANT', ['PENDANT']],
    ['CHAIN', ['CHAIN']],
    ['ANKLET', ['ANKLET']],
    ['RING', ['RING']],
  ];
  for (const [type, keywords] of candidates) {
    if (keywords.some((k) => normalized.includes(k))) return type;
  }
  return null;
}

// Mirrors backend/src/services/aiStudioService.js's resolveAssetTypesForJob —
// duplicated intentionally (same pattern as SHOT_LABELS being duplicated
// across GenerateStep/ReviewImportStep) so Step 3's live Generation Summary
// can compute counts reactively without a round-trip to the server.
export function resolveAssetTypesForJob({
  generateRoseGold,
  hasPresenter,
}: {
  generateRoseGold: boolean;
  hasPresenter: boolean;
}): AssetType[] {
  const types: AssetType[] = ['YELLOW_FRONT', 'YELLOW_HERO_45'];
  if (generateRoseGold) types.push('ROSE_FRONT', 'ROSE_HERO_45');
  if (hasPresenter) {
    types.push('PRESENTER_YELLOW_1');
    types.push(generateRoseGold ? 'PRESENTER_ROSE' : 'PRESENTER_YELLOW_2');
  }
  return types;
}

export function catalogueCount(types: AssetType[]): number {
  return types.filter((t) => t === 'YELLOW_FRONT' || t === 'YELLOW_HERO_45' || t === 'ROSE_FRONT' || t === 'ROSE_HERO_45')
    .length;
}

export function presenterCount(types: AssetType[]): number {
  return types.filter((t) => t.startsWith('PRESENTER_')).length;
}

export const SHOT_LABELS: Record<AssetType, string> = {
  YELLOW_FRONT: 'Yellow Gold — Front Catalogue',
  YELLOW_HERO_45: 'Yellow Gold — 45° Hero Angle',
  ROSE_FRONT: 'Rose Gold — Front Catalogue',
  ROSE_HERO_45: 'Rose Gold — 45° Hero Angle',
  PRESENTER_YELLOW_1: 'Yellow Gold — Presenter',
  PRESENTER_YELLOW_2: 'Yellow Gold — Presenter (Alt Angle)',
  PRESENTER_ROSE: 'Rose Gold — Presenter',
};

export type AssetGroup = 'Yellow Gold' | 'Rose Gold' | 'Presenter';

export function groupForAssetType(assetType: AssetType): AssetGroup {
  if (assetType.startsWith('PRESENTER_')) return 'Presenter';
  return assetType.startsWith('ROSE_') ? 'Rose Gold' : 'Yellow Gold';
}

export function metalColorForAssetType(assetType: AssetType): 'YELLOW' | 'ROSE' {
  return assetType.startsWith('ROSE_') || assetType === 'PRESENTER_ROSE' ? 'ROSE' : 'YELLOW';
}
