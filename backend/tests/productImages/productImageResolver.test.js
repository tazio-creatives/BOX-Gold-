import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { resolveImageForColour, selectGroupForColour } from '../../src/services/productImageResolver.js';
import { imageLabelsForAssetType, RING_ASSET_TYPES, ASSET_TYPES } from '../../src/services/aiStudioService.js';

// Pure unit tests — no DB. One "photo" = the 9 size/format rows sharing a
// sort_order, exactly as processAndStoreImage writes them.
const VARIANTS = ['thumbnail', 'small', 'medium', 'large'];
function photo(sortOrder, { goldColour = 'ANY', shotType = 'OTHER', isPrimary = false, type = 'AI_GENERATED' } = {}) {
  const rows = [];
  for (const variant of VARIANTS) {
    for (const format of ['avif', 'webp']) {
      rows.push({ sort_order: sortOrder, type, variant, format, url: `u/${sortOrder}-${variant}.${format}`, is_primary: isPrimary, gold_colour: goldColour, shot_type: shotType });
    }
  }
  rows.push({ sort_order: sortOrder, type, variant: 'original', format: 'jpeg', url: `u/${sortOrder}-original.jpeg`, is_primary: isPrimary, gold_colour: goldColour, shot_type: shotType });
  return rows;
}
const pick = (rows, colour) => selectGroupForColour(rows, colour)?.sortOrder ?? null;

describe('resolveImageForColour priority', () => {
  // Isolanza's real layout: Yellow front/side, Rose front (featured)/side, two hands.
  const isolanza = [
    ...photo(0, { goldColour: 'YELLOW', shotType: 'FRONT' }),
    ...photo(1, { goldColour: 'YELLOW', shotType: 'SIDE' }),
    ...photo(2, { goldColour: 'ROSE', shotType: 'FRONT', isPrimary: true }),
    ...photo(3, { goldColour: 'ROSE', shotType: 'SIDE' }),
    ...photo(4, { goldColour: 'YELLOW', shotType: 'MODEL' }),
    ...photo(5, { goldColour: 'ROSE', shotType: 'MODEL' }),
  ];

  test('1. matching colour + FRONT wins over a featured photo of the other colour', () => {
    assert.equal(pick(isolanza, 'YELLOW'), 0);
    assert.equal(pick(isolanza, 'ROSE'), 2);
  });

  test('2. matching colour + other catalogue shot when there is no FRONT', () => {
    const rows = [...photo(0, { goldColour: 'ROSE', shotType: 'FRONT', isPrimary: true }), ...photo(1, { goldColour: 'YELLOW', shotType: 'ANGLE' })];
    assert.equal(pick(rows, 'YELLOW'), 1);
  });

  test('2b. an explicitly coloured OTHER shot counts as catalogue for its colour', () => {
    const rows = [...photo(0, { goldColour: 'ROSE', shotType: 'FRONT', isPrimary: true }), ...photo(1, { goldColour: 'YELLOW', shotType: 'OTHER' })];
    assert.equal(pick(rows, 'YELLOW'), 1);
  });

  test('3. ANY + FRONT before 4. ANY + ANGLE/SIDE/MACRO', () => {
    const rows = [
      ...photo(0, { goldColour: 'ROSE', shotType: 'FRONT', isPrimary: true }),
      ...photo(1, { goldColour: 'ANY', shotType: 'SIDE' }),
      ...photo(2, { goldColour: 'ANY', shotType: 'FRONT' }),
    ];
    assert.equal(pick(rows, 'YELLOW'), 2);
    assert.equal(pick(rows.filter((r) => r.sort_order !== 2), 'YELLOW'), 1);
  });

  test('4. unlabelled ANY/OTHER photos never displace the featured photo', () => {
    const rows = [...photo(0), ...photo(1, { isPrimary: true }), ...photo(2)];
    assert.equal(pick(rows, 'YELLOW'), 1);
    assert.equal(pick(rows, 'ROSE'), 1);
  });

  test('5. featured photo is the final fallback (e.g. White Gold with no White photo)', () => {
    assert.equal(pick(isolanza, 'WHITE'), 2);
  });

  test('never swaps Yellow for Rose while a colour-neutral catalogue photo exists', () => {
    const rows = [...photo(0, { goldColour: 'ROSE', shotType: 'FRONT', isPrimary: true }), ...photo(1, { goldColour: 'ANY', shotType: 'ANGLE' })];
    assert.equal(pick(rows, 'YELLOW'), 1);
  });

  test('MODEL and SIZE_GUIDE photos are never chosen as catalogue images', () => {
    const rows = [
      ...photo(0, { goldColour: 'ROSE', shotType: 'FRONT', isPrimary: true }),
      ...photo(1, { goldColour: 'YELLOW', shotType: 'MODEL' }),
      ...photo(2, { goldColour: 'ANY', shotType: 'SIZE_GUIDE', type: 'PRODUCT_SIZE' }),
      ...photo(3, { goldColour: 'YELLOW', shotType: 'SIZE_GUIDE', type: 'PRODUCT_SIZE' }),
    ];
    assert.equal(pick(rows, 'YELLOW'), 0); // falls back to featured, not the hand or the size guide
  });

  test('within a step the featured photo wins, otherwise the lowest gallery position', () => {
    const rows = [
      ...photo(0, { goldColour: 'YELLOW', shotType: 'FRONT' }),
      ...photo(1, { goldColour: 'YELLOW', shotType: 'FRONT', isPrimary: true }),
      ...photo(2, { goldColour: 'YELLOW', shotType: 'FRONT' }),
    ];
    assert.equal(pick(rows, 'YELLOW'), 1);
    assert.equal(pick(rows.map((r) => ({ ...r, is_primary: false })), 'YELLOW'), 0);
  });

  test('no colour chosen → featured photo (today’s behaviour)', () => {
    assert.equal(pick(isolanza, null), 2);
  });

  test('returns small + large WebP URLs', () => {
    assert.deepEqual(resolveImageForColour(isolanza, 'YELLOW'), { smallUrl: 'u/0-small.webp', largeUrl: 'u/0-large.webp' });
  });

  test('falls back to AVIF/original when WebP is missing; null with no photos', () => {
    const rows = photo(0, { isPrimary: true }).filter((r) => r.format !== 'webp');
    assert.deepEqual(resolveImageForColour(rows, 'YELLOW'), { smallUrl: 'u/0-small.avif', largeUrl: 'u/0-large.avif' });
    assert.equal(resolveImageForColour([], 'YELLOW'), null);
    assert.equal(resolveImageForColour(undefined, 'YELLOW'), null);
  });
});

describe('imageLabelsForAssetType (AI Studio import labels)', () => {
  const expected = {
    YELLOW_FRONT: ['YELLOW', 'FRONT'],
    YELLOW_HERO_45: ['YELLOW', 'ANGLE'],
    ROSE_FRONT: ['ROSE', 'FRONT'],
    ROSE_HERO_45: ['ROSE', 'ANGLE'],
    PRESENTER_YELLOW_1: ['YELLOW', 'MODEL'],
    PRESENTER_YELLOW_2: ['YELLOW', 'MODEL'],
    PRESENTER_ROSE: ['ROSE', 'MODEL'],
    RING_HAND_1: ['YELLOW', 'MODEL'],
    RING_HAND_2: ['ROSE', 'MODEL'],
    RING_GOLD_FRONT: ['YELLOW', 'FRONT'],
    RING_GOLD_SIDE: ['YELLOW', 'SIDE'],
    RING_ROSE_FRONT: ['ROSE', 'FRONT'],
    RING_ROSE_SIDE: ['ROSE', 'SIDE'],
  };

  test('every asset type is mapped (with Rose Gold on)', () => {
    for (const assetType of [...ASSET_TYPES, ...RING_ASSET_TYPES]) {
      const { goldColour, shotType } = imageLabelsForAssetType(assetType, true);
      assert.deepEqual([goldColour, shotType], expected[assetType], assetType);
    }
  });

  test('RING_HAND_2 is Yellow when Rose Gold is off', () => {
    assert.deepEqual(imageLabelsForAssetType('RING_HAND_2', false), { goldColour: 'YELLOW', shotType: 'MODEL' });
  });

  test('unknown asset type throws', () => {
    assert.throws(() => imageLabelsForAssetType('NOPE'));
  });
});
