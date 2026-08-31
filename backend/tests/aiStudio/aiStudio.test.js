import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { deriveJobStatus } from '../../src/jobs/aiStudioJob.js';
import { confirmSchema } from '../../src/controllers/aiStudio.controller.js';
import {
  JEWELLERY_TYPES,
  HAND_POSES,
  resolveAssetTypesForJob,
  previewPromptsForJob,
  metalColorForAssetType,
  formatHandPose,
} from '../../src/services/aiStudioService.js';
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

describe('resolveAssetTypesForJob — Ring-only output structure', () => {
  test('confirmedType RING, rose gold off -> exactly 4: both hand poses + gold front/side, no 45° hero, ignores hasPresenter', () => {
    assert.deepEqual(
      resolveAssetTypesForJob({ generateRoseGold: false, hasPresenter: true, confirmedType: 'RING' }),
      ['RING_HAND_1', 'RING_HAND_2', 'RING_GOLD_FRONT', 'RING_GOLD_SIDE'],
    );
  });

  test('confirmedType RING, rose gold on -> exactly 6, in the client-mandated Position 1-6 order', () => {
    assert.deepEqual(
      resolveAssetTypesForJob({ generateRoseGold: true, hasPresenter: false, confirmedType: 'RING' }),
      ['RING_HAND_1', 'RING_HAND_2', 'RING_GOLD_FRONT', 'RING_GOLD_SIDE', 'RING_ROSE_FRONT', 'RING_ROSE_SIDE'],
    );
  });

  test('never produces a 45° Hero or PRESENTER_* asset for Ring', () => {
    const types = resolveAssetTypesForJob({ generateRoseGold: true, hasPresenter: true, confirmedType: 'RING' });
    assert.ok(!types.some((t) => t.includes('HERO_45')));
    assert.ok(!types.some((t) => t.startsWith('PRESENTER_')));
  });
});

describe('metalColorForAssetType — Ring types', () => {
  test('RING_HAND_1 and RING_GOLD_* are always Yellow', () => {
    assert.equal(metalColorForAssetType('RING_HAND_1', true), 'YELLOW');
    assert.equal(metalColorForAssetType('RING_GOLD_FRONT', true), 'YELLOW');
    assert.equal(metalColorForAssetType('RING_GOLD_SIDE', false), 'YELLOW');
  });

  test('RING_ROSE_* are always Rose', () => {
    assert.equal(metalColorForAssetType('RING_ROSE_FRONT', true), 'ROSE');
    assert.equal(metalColorForAssetType('RING_ROSE_SIDE', true), 'ROSE');
  });

  test('RING_HAND_2 follows the Rose Gold toggle — Rose when required, Gold otherwise', () => {
    assert.equal(metalColorForAssetType('RING_HAND_2', true), 'ROSE');
    assert.equal(metalColorForAssetType('RING_HAND_2', false), 'YELLOW');
  });
});

describe('formatHandPose', () => {
  test('every hand pose formats to its exact spec-mandated label', () => {
    assert.equal(formatHandPose('BACK_OF_HAND_HERO'), 'Back-of-Hand Hero');
    assert.equal(formatHandPose('ELEGANT_DIAGONAL'), 'Elegant Diagonal');
    assert.equal(formatHandPose('SIDE_ROTATION'), 'Side Rotation');
    assert.equal(formatHandPose('SOFT_RESTING_POSE'), 'Soft Resting Pose');
    assert.equal(formatHandPose('FINGER_DETAIL_CLOSEUP'), 'Finger Detail Close-up');
    assert.equal(HAND_POSES.length, 5);
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
      confirmedType: 'EARRINGS',
      template: FAKE_TEMPLATE,
      presenter: null,
      generateRoseGold: false,
      overridesByAssetType: undefined,
    });
    assert.deepEqual(previews.map((p) => p.assetType), ['YELLOW_FRONT', 'YELLOW_HERO_45']);
    for (const p of previews) {
      assert.equal(p.mode, 'recommended');
      assert.equal(p.categoryPlacementRules.length, 0);
      assert.ok(p.lockedProductRules.some((s) => s.includes('confirmed product category is Earrings')));
    }
  });

  test('Bracelet gets a clasp-hidden negative instruction on every generated view, and it does not leak to other categories', () => {
    const braceletPreviews = previewPromptsForJob({
      confirmedType: 'BRACELET',
      template: FAKE_TEMPLATE,
      presenter: FAKE_PRESENTER,
      generateRoseGold: true,
      overridesByAssetType: undefined,
    });
    // Same 6 asset types/order as any other non-Ring category — the clasp
    // rule must not change what gets generated, only add a negative.
    assert.deepEqual(
      braceletPreviews.map((p) => p.assetType),
      ['YELLOW_FRONT', 'YELLOW_HERO_45', 'ROSE_FRONT', 'ROSE_HERO_45', 'PRESENTER_YELLOW_1', 'PRESENTER_ROSE'],
    );
    for (const p of braceletPreviews) {
      assert.ok(
        p.negativeInstructions.some((n) => /clasp/i.test(n) && /lock/i.test(n)),
        `missing clasp-hidden negative for ${p.assetType}`,
      );
      assert.match(p.finalPrompt, /do not show the bracelet's lock, clasp/i);
    }

    const banglePreviews = previewPromptsForJob({
      confirmedType: 'BANGLE',
      template: FAKE_TEMPLATE,
      presenter: FAKE_PRESENTER,
      generateRoseGold: true,
      overridesByAssetType: undefined,
    });
    for (const p of banglePreviews) {
      assert.ok(!p.negativeInstructions.some((n) => /clasp/i.test(n)), `clasp rule leaked into BANGLE for ${p.assetType}`);
    }
  });

  test('presenter shots include the exact spec-mandated Ring placement/exclusion wording (Problem 2) — a non-Ring category still using the generic Presenter flow', () => {
    const previews = previewPromptsForJob({
      confirmedType: 'RING',
      template: FAKE_TEMPLATE,
      presenter: FAKE_PRESENTER,
      generateRoseGold: false,
      handPose: 'BACK_OF_HAND_HERO',
      overridesByAssetType: undefined,
    });
    // RING now uses the dedicated hand-pose workflow, not PRESENTER_* — its
    // hand shots carry the ring-finger placement wording directly instead.
    const handShot = previews.find((p) => p.assetType === 'RING_HAND_1');
    assert.equal(handShot.categoryPlacementRules.length, 1);
    assert.match(handShot.categoryPlacementRules[0], /ring finger/i);
  });

  test('every non-Ring jewellery type gets a non-empty presenter placement rule, including the generic-fallback types', () => {
    for (const type of JEWELLERY_TYPES.filter((t) => t !== 'UNKNOWN' && t !== 'RING')) {
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

describe('previewPromptsForJob — Ring-only output structure', () => {
  const RING_TEMPLATE = { ...FAKE_TEMPLATE };

  test('6-image plan uses the exact spec labels/order and never a 45° Hero', () => {
    const previews = previewPromptsForJob({
      confirmedType: 'RING',
      template: RING_TEMPLATE,
      presenter: null,
      generateRoseGold: true,
      handPose: 'BACK_OF_HAND_HERO',
      overridesByAssetType: undefined,
    });
    assert.deepEqual(
      previews.map((p) => p.assetType),
      ['RING_HAND_1', 'RING_HAND_2', 'RING_GOLD_FRONT', 'RING_GOLD_SIDE', 'RING_ROSE_FRONT', 'RING_ROSE_SIDE'],
    );
    // "45 degree" legitimately appears in Front View's own negative
    // instruction ("do not rotate to a 30-45 degree angle") — what must
    // never appear is the dedicated three-quarter Hero shot's own wording.
    assert.ok(!previews.some((p) => p.finalPrompt.includes('three-quarter hero view')));
  });

  test('4-image plan (no Rose Gold) is just the first 4', () => {
    const previews = previewPromptsForJob({
      confirmedType: 'RING',
      template: RING_TEMPLATE,
      presenter: null,
      generateRoseGold: false,
      handPose: 'BACK_OF_HAND_HERO',
      overridesByAssetType: undefined,
    });
    assert.deepEqual(
      previews.map((p) => p.assetType),
      ['RING_HAND_1', 'RING_HAND_2', 'RING_GOLD_FRONT', 'RING_GOLD_SIDE'],
    );
    // No Rose Gold required -> Hand Pose 2 falls back to Gold, not Rose.
    const hand2 = previews.find((p) => p.assetType === 'RING_HAND_2');
    assert.equal(hand2.metalColor, 'YELLOW');
  });

  test('Hand Pose 2 always uses a different pose from Hand Pose 1 (cyclic rotation)', () => {
    for (const pose of HAND_POSES) {
      const previews = previewPromptsForJob({
        confirmedType: 'RING',
        template: RING_TEMPLATE,
        presenter: null,
        generateRoseGold: false,
        handPose: pose,
        overridesByAssetType: undefined,
      });
      const hand1 = previews.find((p) => p.assetType === 'RING_HAND_1');
      const hand2 = previews.find((p) => p.assetType === 'RING_HAND_2');
      assert.notEqual(
        hand1.categoryPlacementRules[0],
        hand2.categoryPlacementRules[0],
        `pose text for ${pose} was reused unchanged on Hand Pose 2`,
      );
    }
  });

  test('hand shots never mention a face, body or clothing, and require exactly one ring', () => {
    const previews = previewPromptsForJob({
      confirmedType: 'RING',
      template: RING_TEMPLATE,
      presenter: null,
      generateRoseGold: true,
      handPose: 'BACK_OF_HAND_HERO',
      overridesByAssetType: undefined,
    });
    for (const assetType of ['RING_HAND_1', 'RING_HAND_2']) {
      const shot = previews.find((p) => p.assetType === assetType);
      assert.match(shot.finalPrompt, /do not show a face, head, hair, upper body/i);
      assert.match(shot.finalPrompt, /exactly one ring/i);
      assert.match(shot.finalPrompt, /five naturally proportioned fingers/i);
    }
  });

  test('hand shots use a natural background that is never tied to the metal colour', () => {
    const previews = previewPromptsForJob({
      confirmedType: 'RING',
      template: RING_TEMPLATE,
      presenter: null,
      generateRoseGold: true,
      handPose: 'BACK_OF_HAND_HERO',
      overridesByAssetType: undefined,
    });
    const hand1 = previews.find((p) => p.assetType === 'RING_HAND_1'); // Yellow Gold
    const hand2 = previews.find((p) => p.assetType === 'RING_HAND_2'); // Rose Gold
    // Same background instruction regardless of the metal colour of the shot.
    assert.equal(hand1.creativeInstructions.background, hand2.creativeInstructions.background);
    assert.match(hand1.finalPrompt, /natural photographic environment/i);
    assert.match(hand1.finalPrompt, /do not force a champagne, ivory, peach or rose-coloured background/i);
    assert.doesNotMatch(hand1.finalPrompt, /#F4E7DA|#E8C4B2/);
  });

  test('Front View is a true direct view, explicitly not the upright orientation used for Side Profile', () => {
    const previews = previewPromptsForJob({
      confirmedType: 'RING',
      template: RING_TEMPLATE,
      presenter: null,
      generateRoseGold: true,
      handPose: 'BACK_OF_HAND_HERO',
      overridesByAssetType: undefined,
    });
    const goldFront = previews.find((p) => p.assetType === 'RING_GOLD_FRONT');
    assert.match(goldFront.finalPrompt, /centre stone.*visual centre/i);
    assert.match(goldFront.finalPrompt, /do not stand the ring vertically upright/i);
    assert.match(goldFront.finalPrompt, /do not display the circular band opening as the main shape/i);
    assert.match(goldFront.finalPrompt, /do not rotate the ring to a 30-45 degree angle/i);
  });

  test('Side Profile prompts are distinct from Front View and explicitly reject a front-facing result', () => {
    const previews = previewPromptsForJob({
      confirmedType: 'RING',
      template: RING_TEMPLATE,
      presenter: null,
      generateRoseGold: true,
      handPose: 'BACK_OF_HAND_HERO',
      overridesByAssetType: undefined,
    });
    const goldFront = previews.find((p) => p.assetType === 'RING_GOLD_FRONT');
    const goldSide = previews.find((p) => p.assetType === 'RING_GOLD_SIDE');
    assert.notEqual(goldFront.finalPrompt, goldSide.finalPrompt);
    assert.match(goldSide.finalPrompt, /upright/i);
    assert.match(goldSide.finalPrompt, /band opening/i);
    assert.match(goldSide.finalPrompt, /80-90 degrees/i);
    assert.match(goldSide.finalPrompt, /do not use a front-facing angle/i);
    assert.match(goldSide.finalPrompt, /do not use a slight three-quarter rotation/i);

    const roseSide = previews.find((p) => p.assetType === 'RING_ROSE_SIDE');
    assert.match(roseSide.finalPrompt, /opposite side direction from the gold side profile/i);
  });

  test('every Ring asset carries the extra Ring-only fidelity/no-bangle-conversion instruction', () => {
    const previews = previewPromptsForJob({
      confirmedType: 'RING',
      template: RING_TEMPLATE,
      presenter: null,
      generateRoseGold: true,
      handPose: 'BACK_OF_HAND_HERO',
      overridesByAssetType: undefined,
    });
    for (const p of previews) {
      assert.match(p.finalPrompt, /convert the ring into a bangle or bracelet/i);
    }
  });

  test('Gold catalogue shots use the spec-exact satin background hex values, Rose shots use the Rose set', () => {
    const previews = previewPromptsForJob({
      confirmedType: 'RING',
      template: RING_TEMPLATE,
      presenter: null,
      generateRoseGold: true,
      handPose: 'BACK_OF_HAND_HERO',
      overridesByAssetType: undefined,
    });
    const goldFront = previews.find((p) => p.assetType === 'RING_GOLD_FRONT');
    assert.match(goldFront.finalPrompt, /#F4E7DA/);
    const roseFront = previews.find((p) => p.assetType === 'RING_ROSE_FRONT');
    assert.match(roseFront.finalPrompt, /#E8C4B2/);
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
