import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { deriveJobStatus } from '../../src/jobs/aiStudioJob.js';
import { confirmSchema } from '../../src/controllers/aiStudio.controller.js';
import { JEWELLERY_TYPES, resolveAssetTypesForJob, previewPromptsForJob } from '../../src/services/aiStudioService.js';
import { query } from '../../src/config/db.js';
import { insertJob, findCategoryTemplate } from '../../src/repositories/aiStudio.repository.js';

const asset = (status) => ({ status });

describe('deriveJobStatus (plan §4/§6 3-way terminal rule)', () => {
  test('all 4 READY -> review_ready', () => {
    assert.equal(
      deriveJobStatus([asset('READY'), asset('READY'), asset('READY'), asset('READY')]),
      'review_ready',
    );
  });

  test('at least one READY and one FAILED -> partially_failed', () => {
    assert.equal(
      deriveJobStatus([asset('READY'), asset('FAILED'), asset('READY'), asset('READY')]),
      'partially_failed',
    );
  });

  test('all 4 FAILED -> failed', () => {
    assert.equal(
      deriveJobStatus([asset('FAILED'), asset('FAILED'), asset('FAILED'), asset('FAILED')]),
      'failed',
    );
  });

  test('still in flight (some PENDING/GENERATING) -> null, no status change yet', () => {
    assert.equal(
      deriveJobStatus([asset('READY'), asset('GENERATING'), asset('PENDING'), asset('READY')]),
      null,
    );
  });
});

describe('confirmSchema (plan §5: UNKNOWN and low-confidence handling)', () => {
  test('rejects UNKNOWN — generation always needs a real category', () => {
    assert.throws(() => confirmSchema.parse({ jewelleryType: 'UNKNOWN' }));
  });

  test('rejects a missing jewelleryType — never silently falls back to the analysis result', () => {
    assert.throws(() => confirmSchema.parse({}));
  });

  test('accepts every real jewellery type with no presenter (No Presenter is valid)', () => {
    for (const type of JEWELLERY_TYPES.filter((t) => t !== 'UNKNOWN')) {
      assert.doesNotThrow(() => confirmSchema.parse({ jewelleryType: type, presenterId: null }));
    }
  });

  test('accepts an explicit generateRoseGold + presenterId', () => {
    assert.doesNotThrow(() =>
      confirmSchema.parse({
        jewelleryType: 'RING',
        presenterId: '123e4567-e89b-12d3-a456-426614174000',
        generateRoseGold: true,
      }),
    );
  });

  test('rejects a non-uuid presenterId', () => {
    assert.throws(() => confirmSchema.parse({ jewelleryType: 'RING', presenterId: 'not-a-uuid' }));
  });
});

describe('resolveAssetTypesForJob (rose gold toggle x presenter selection)', () => {
  test('rose gold off, no presenter -> 2 yellow catalogue shots', () => {
    assert.deepEqual(
      resolveAssetTypesForJob({ generateRoseGold: false, hasPresenter: false }),
      ['YELLOW_FRONT', 'YELLOW_HERO_45'],
    );
  });

  test('rose gold off, presenter selected -> 4, both yellow presenter views', () => {
    assert.deepEqual(
      resolveAssetTypesForJob({ generateRoseGold: false, hasPresenter: true }),
      ['YELLOW_FRONT', 'YELLOW_HERO_45', 'PRESENTER_YELLOW_1', 'PRESENTER_YELLOW_2'],
    );
  });

  test('rose gold on, no presenter -> 4, yellow + rose catalogue shots', () => {
    assert.deepEqual(
      resolveAssetTypesForJob({ generateRoseGold: true, hasPresenter: false }),
      ['YELLOW_FRONT', 'YELLOW_HERO_45', 'ROSE_FRONT', 'ROSE_HERO_45'],
    );
  });

  test('rose gold on, presenter selected -> 6, matched yellow/rose presenter pair', () => {
    assert.deepEqual(
      resolveAssetTypesForJob({ generateRoseGold: true, hasPresenter: true }),
      ['YELLOW_FRONT', 'YELLOW_HERO_45', 'ROSE_FRONT', 'ROSE_HERO_45', 'PRESENTER_YELLOW_1', 'PRESENTER_ROSE'],
    );
  });
});

describe('category templates (plan §9 — table-driven, all 12 categories)', () => {
  test('every jewellery type except UNKNOWN has a complete, active template', async () => {
    const realTypes = JEWELLERY_TYPES.filter((t) => t !== 'UNKNOWN');
    for (const type of realTypes) {
      const template = await findCategoryTemplate(type);
      assert.ok(template, `missing template for ${type}`);
      assert.ok(template.front_prompt);
      assert.ok(template.hero_45_prompt);
      assert.ok(template.presenter_placement);
      assert.ok(template.presenter_crop);
      assert.ok(template.lifestyle_prompt);
    }
    // 10 original types + BROOCH + OTHER (added for mandatory category
    // confirmation — see .claude/plans/sprightly-watching-mccarthy.md).
    assert.equal(realTypes.length, 12);
  });
});

const FAKE_TEMPLATE = {
  front_prompt: 'FRONT_PROMPT_TEXT',
  hero_45_prompt: 'HERO_PROMPT_TEXT',
  presenter_placement: 'hand-focused presenter shot',
  presenter_crop: 'portrait 4:5',
};
const FAKE_PRESENTER = { prompt_descriptor: 'a friendly presenter', style_label: 'Contemporary' };

describe('previewPromptsForJob (Review Prompts panel — pure, no DB/API calls)', () => {
  test('recommended mode: no presenter, rose gold off -> 2 catalogue prompts, no placement rules', () => {
    const previews = previewPromptsForJob({
      confirmedType: 'RING',
      template: FAKE_TEMPLATE,
      presenter: null,
      generateRoseGold: false,
      overridesByAssetType: undefined,
    });
    assert.deepEqual(previews.map((p) => p.assetType), ['YELLOW_FRONT', 'YELLOW_HERO_45']);
    for (const p of previews) {
      assert.equal(p.mode, 'recommended');
      assert.equal(p.categoryPlacementRules.length, 0);
      assert.ok(p.lockedProductRules.some((s) => s.includes('confirmed product category is Ring')));
    }
  });

  test('presenter shots include the exact spec-mandated Ring placement/exclusion wording (Problem 2)', () => {
    const previews = previewPromptsForJob({
      confirmedType: 'RING',
      template: FAKE_TEMPLATE,
      presenter: FAKE_PRESENTER,
      generateRoseGold: false,
      overridesByAssetType: undefined,
    });
    const presenterShot = previews.find((p) => p.assetType === 'PRESENTER_YELLOW_1');
    assert.equal(presenterShot.categoryPlacementRules.length, 1);
    assert.match(presenterShot.categoryPlacementRules[0], /ring finger/i);
    assert.match(
      presenterShot.categoryPlacementRules[0],
      /No earrings, necklace, pendant, bracelet, bangle, nose pin, anklet, watch or other ring/,
    );
  });

  test('every real jewellery type gets a non-empty presenter placement rule, including the generic-fallback types', () => {
    for (const type of JEWELLERY_TYPES.filter((t) => t !== 'UNKNOWN')) {
      const previews = previewPromptsForJob({
        confirmedType: type,
        template: FAKE_TEMPLATE,
        presenter: FAKE_PRESENTER,
        generateRoseGold: false,
        overridesByAssetType: undefined,
      });
      const presenterShot = previews.find((p) => p.assetType.startsWith('PRESENTER_'));
      assert.ok(presenterShot, `no presenter asset planned for ${type}`);
      assert.equal(presenterShot.categoryPlacementRules.length, 1, `missing placement rule for ${type}`);
      assert.ok(presenterShot.categoryPlacementRules[0].length > 20, `placement rule too short for ${type}`);
    }
  });

  test('customising one card only changes its own creative fields — locked rules and placement rules are identical to the recommended version, and other cards are untouched', () => {
    const recommended = previewPromptsForJob({
      confirmedType: 'NECKLACE',
      template: FAKE_TEMPLATE,
      presenter: FAKE_PRESENTER,
      generateRoseGold: false,
      overridesByAssetType: undefined,
    });
    const customised = previewPromptsForJob({
      confirmedType: 'NECKLACE',
      template: FAKE_TEMPLATE,
      presenter: FAKE_PRESENTER,
      generateRoseGold: false,
      overridesByAssetType: { PRESENTER_YELLOW_1: { background: 'a custom studio backdrop' } },
    });

    for (let i = 0; i < recommended.length; i++) {
      assert.deepEqual(customised[i].lockedProductRules, recommended[i].lockedProductRules);
      assert.deepEqual(customised[i].categoryPlacementRules, recommended[i].categoryPlacementRules);
    }

    const customCard = customised.find((p) => p.assetType === 'PRESENTER_YELLOW_1');
    assert.equal(customCard.mode, 'customised');
    assert.equal(customCard.creativeInstructions.background, 'a custom studio backdrop');
    assert.ok(customCard.finalPrompt.includes('a custom studio backdrop'));

    const untouchedCard = customised.find((p) => p.assetType === 'YELLOW_FRONT');
    assert.equal(untouchedCard.mode, 'recommended');
  });

  test('rose gold on + presenter -> 6 assets, matched yellow/rose presenter pair, rose prompt mentions rose gold', () => {
    const previews = previewPromptsForJob({
      confirmedType: 'BANGLE',
      template: FAKE_TEMPLATE,
      presenter: FAKE_PRESENTER,
      generateRoseGold: true,
      overridesByAssetType: undefined,
    });
    assert.deepEqual(
      previews.map((p) => p.assetType),
      ['YELLOW_FRONT', 'YELLOW_HERO_45', 'ROSE_FRONT', 'ROSE_HERO_45', 'PRESENTER_YELLOW_1', 'PRESENTER_ROSE'],
    );
    const rosePresenter = previews.find((p) => p.assetType === 'PRESENTER_ROSE');
    assert.match(rosePresenter.finalPrompt, /rose gold/i);
  });
});

describe('duplicate active job prevention (plan §8)', () => {
  test('a second active job for the same product is rejected by the partial unique index', async () => {
    const {
      rows: [{ id: productId }],
    } = await query('SELECT id FROM products LIMIT 1');

    const first = await insertJob({ productId, referenceImageUrls: ['http://x/test1.jpg'] });
    try {
      await assert.rejects(
        () => insertJob({ productId, referenceImageUrls: ['http://x/test2.jpg'] }),
        (err) => err.code === '23505',
      );
    } finally {
      await query('DELETE FROM ai_studio_jobs WHERE id = $1', [first.id]);
    }
  });

  test('a new job is allowed once the previous one reaches a terminal status', async () => {
    const {
      rows: [{ id: productId }],
    } = await query('SELECT id FROM products LIMIT 1');

    const first = await insertJob({ productId, referenceImageUrls: ['http://x/test1.jpg'] });
    await query("UPDATE ai_studio_jobs SET status = 'completed' WHERE id = $1", [first.id]);

    const second = await insertJob({ productId, referenceImageUrls: ['http://x/test2.jpg'] });
    await query('DELETE FROM ai_studio_jobs WHERE id IN ($1, $2)', [first.id, second.id]);
  });
});
