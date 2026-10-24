// Picks which product photo to show for a chosen gold colour — the cart,
// checkout (order snapshot) and Buy Now all go through this one rule
// (web/src/utils/resolveImageForColour.ts mirrors it for Buy Now's
// client-side thumbnail).
//
// Priority, for colour C:
//   1. C + FRONT
//   2. C + any other catalogue shot (anything but MODEL / SIZE_GUIDE — an
//      explicit colour label is itself a deliberate choice)
//   3. ANY + FRONT
//   4. ANY + ANGLE / SIDE / MACRO (explicitly labelled only — unlabelled
//      rows are ANY + OTHER and must not displace the featured photo)
//   5. the featured (primary) photo — today's behaviour
// Within a step the featured photo wins if it qualifies, else the lowest
// gallery position. Yellow and Rose are never swapped for each other while
// a matching or colour-neutral photo exists; only step 5 can show another
// colour, when the product simply has no photo for C.

export const GOLD_COLOURS = ['YELLOW', 'ROSE', 'WHITE', 'ANY'];
export const SHOT_TYPES = ['FRONT', 'ANGLE', 'SIDE', 'MACRO', 'MODEL', 'SIZE_GUIDE', 'OTHER'];

const NON_CATALOGUE_SHOTS = new Set(['MODEL', 'SIZE_GUIDE']);
const NEUTRAL_CATALOGUE_SHOTS = new Set(['ANGLE', 'SIDE', 'MACRO']);

// rows: product_images rows (snake_case) for ONE product, any sizes/formats.
function groupRows(rows) {
  const groups = new Map();
  for (const row of rows) {
    if (!groups.has(row.sort_order)) {
      groups.set(row.sort_order, {
        sortOrder: row.sort_order,
        type: row.type,
        isPrimary: row.is_primary,
        goldColour: row.gold_colour ?? 'ANY',
        shotType: row.shot_type ?? 'OTHER',
        rows: [],
      });
    }
    groups.get(row.sort_order).rows.push(row);
  }
  return [...groups.values()].sort((a, b) => a.sortOrder - b.sortOrder);
}

// WebP first: it's what order emails need (AVIF isn't shown by many mail
// clients), and every browser that renders the cart supports it.
function pickUrl(group, size) {
  const order = [
    [size, 'webp'],
    [size, 'avif'],
    [size, 'jpeg'],
    ['original', 'jpeg'],
  ];
  for (const [variant, format] of order) {
    const row = group.rows.find((r) => r.variant === variant && r.format === format);
    if (row) return row.url;
  }
  return group.rows[0]?.url ?? null;
}

function firstMatch(groups, predicate) {
  const matches = groups.filter(predicate);
  return matches.find((g) => g.isPrimary) ?? matches[0] ?? null;
}

export function selectGroupForColour(rows, goldColour) {
  const groups = groupRows(rows);
  const primary = groups.find((g) => g.isPrimary) ?? null;
  if (!goldColour) return primary;

  // Size guides are never a product thumbnail, whatever their labels say.
  const candidates = groups.filter((g) => g.type !== 'PRODUCT_SIZE');
  return (
    firstMatch(candidates, (g) => g.goldColour === goldColour && g.shotType === 'FRONT') ??
    firstMatch(candidates, (g) => g.goldColour === goldColour && !NON_CATALOGUE_SHOTS.has(g.shotType)) ??
    firstMatch(candidates, (g) => g.goldColour === 'ANY' && g.shotType === 'FRONT') ??
    firstMatch(candidates, (g) => g.goldColour === 'ANY' && NEUTRAL_CATALOGUE_SHOTS.has(g.shotType)) ??
    primary
  );
}

// → { smallUrl, largeUrl } or null when the product has no usable photo.
export function resolveImageForColour(rows, goldColour) {
  const group = selectGroupForColour(rows ?? [], goldColour);
  if (!group) return null;
  return { smallUrl: pickUrl(group, 'small'), largeUrl: pickUrl(group, 'large') };
}
