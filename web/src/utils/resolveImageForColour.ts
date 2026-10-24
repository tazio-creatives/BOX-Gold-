import type { GoldColor, ProductImage } from '../api/types';

// Mirrors backend/src/services/productImageResolver.js — the same priority
// the cart and order snapshot use, so Buy Now's checkout thumbnail matches
// what the order will show. For colour C:
//   1. C + FRONT   2. C + other catalogue shot (not MODEL / SIZE_GUIDE)
//   3. ANY + FRONT   4. ANY + ANGLE/SIDE/MACRO   5. featured photo
// Within a step the featured photo wins if it qualifies, else the lowest
// gallery position.

const NON_CATALOGUE = new Set(['MODEL', 'SIZE_GUIDE']);
const NEUTRAL_CATALOGUE = new Set(['ANGLE', 'SIDE', 'MACRO']);

interface Group {
  sortOrder: number;
  isPrimary: boolean;
  type: ProductImage['type'];
  goldColour: string;
  shotType: string;
  rows: ProductImage[];
}

function groupImages(images: ProductImage[]): Group[] {
  const groups = new Map<number, Group>();
  for (const img of images) {
    let group = groups.get(img.sortOrder);
    if (!group) {
      group = {
        sortOrder: img.sortOrder,
        isPrimary: img.isPrimary,
        type: img.type,
        goldColour: img.goldColour ?? 'ANY',
        shotType: img.shotType ?? 'OTHER',
        rows: [],
      };
      groups.set(img.sortOrder, group);
    }
    group.rows.push(img);
  }
  return [...groups.values()].sort((a, b) => a.sortOrder - b.sortOrder);
}

function firstMatch(groups: Group[], predicate: (_group: Group) => boolean): Group | null {
  const matches = groups.filter(predicate);
  return matches.find((g) => g.isPrimary) ?? matches[0] ?? null;
}

// Small (listing/cart size) URL of the photo to show for `goldColour`.
export function resolveSmallImageForColour(images: ProductImage[], goldColour: GoldColor | null): string | null {
  const groups = groupImages(images);
  const primary = groups.find((g) => g.isPrimary) ?? null;
  const candidates = groups.filter((g) => g.type !== 'PRODUCT_SIZE');
  const group = goldColour
    ? (firstMatch(candidates, (g) => g.goldColour === goldColour && g.shotType === 'FRONT') ??
      firstMatch(candidates, (g) => g.goldColour === goldColour && !NON_CATALOGUE.has(g.shotType)) ??
      firstMatch(candidates, (g) => g.goldColour === 'ANY' && g.shotType === 'FRONT') ??
      firstMatch(candidates, (g) => g.goldColour === 'ANY' && NEUTRAL_CATALOGUE.has(g.shotType)) ??
      primary)
    : primary;
  if (!group) return null;
  return (
    group.rows.find((r) => r.variant === 'small' && r.format === 'webp')?.url ??
    group.rows.find((r) => r.variant === 'small')?.url ??
    null
  );
}
