import OpenAI, {
  toFile,
  APIConnectionTimeoutError,
  RateLimitError,
  BadRequestError,
  AuthenticationError,
  PermissionDeniedError,
} from 'openai';
import { zodResponseFormat } from 'openai/helpers/zod';
import { z } from 'zod';
import { env } from '../config/env.js';
import { AppError } from '../utils/AppError.js';

// Measured live: a simple background-cleanup edit takes ~140s, but a
// PRESENTER shot (compositing a model + the jewellery) took ~490s in
// testing — real variance is much wider than the enhancement feature's.
// Timeout needs real headroom, and maxRetries is kept low (1, not the
// enhancement service's 2) since a retry on a call this slow multiplies
// worst-case wall time fast — see aiStudioJob.js's queue expiry, which is
// sized against this same worst case.
const REQUEST_TIMEOUT_MS = 600_000;

let client = null;
function getClient() {
  if (!env.openaiApiKey) {
    throw new AppError(503, 'AI Image Studio is not configured');
  }
  if (!client) {
    client = new OpenAI({ apiKey: env.openaiApiKey, timeout: REQUEST_TIMEOUT_MS, maxRetries: 1 });
  }
  return client;
}

function mapOpenAiError(err) {
  console.error('AI Image Studio OpenAI call failed:', err?.status ?? '', err?.message ?? err);

  if (err instanceof RateLimitError) {
    return new AppError(429, 'AI Image Studio is busy right now — please try again in a moment.');
  }
  if (err instanceof APIConnectionTimeoutError) {
    return new AppError(504, 'The request timed out — please try again.');
  }
  if (err instanceof BadRequestError) {
    return new AppError(400, 'The uploaded image could not be processed — try a different photo.');
  }
  if (err instanceof AuthenticationError || err instanceof PermissionDeniedError) {
    return new AppError(503, 'AI Image Studio is not configured correctly.');
  }
  return new AppError(502, 'AI Image Studio request failed — please try again.');
}

export const JEWELLERY_TYPES = [
  'RING',
  'BRACELET',
  'BANGLE',
  'NECKLACE',
  'EARRINGS',
  'PENDANT',
  'CHAIN',
  'ANKLET',
  'NOSE_PIN',
  'MANGALSUTRA',
  'BROOCH',
  'OTHER',
  'UNKNOWN',
];

// e.g. "NOSE_PIN" -> "Nose Pin" — used for the human-readable category name
// embedded in prompts and shown on the Review Prompts panel.
export function formatJewelleryType(type) {
  return type
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

const AnalysisSchema = z.object({
  jewelleryType: z.enum(JEWELLERY_TYPES),
  jewelleryTypeConfidence: z.number().min(0).max(1),
  metalColor: z.enum(['YELLOW', 'ROSE', 'WHITE']).nullable(),
  metalColorConfidence: z.number().min(0).max(1),
  gemstone: z.string().nullable(),
  gemstoneConfidence: z.number().min(0).max(1),
  dominantShape: z.string().nullable(),
  shapeConfidence: z.number().min(0).max(1),
  suggestedCategorySlug: z.string().nullable(),
});

const ANALYSIS_SYSTEM_PROMPT = `You are a jewellery product analyst. Examine the uploaded photograph and identify the jewellery item's type, metal colour, gemstone, and dominant shape, each with a confidence score from 0 to 1. Use "UNKNOWN" for jewelleryType only if the item genuinely does not match any of the listed types or the photo is too unclear to tell. This is a suggestion for a human reviewer, not a final decision — always report your best honest confidence, do not artificially inflate it.`;

// Vision + structured output — every field is a suggestion the admin must
// confirm or correct; nothing here is ever written to the product directly
// (plan §5: "AI-detected attributes are suggestions only").
export async function analyseJewellery(imageBuffer, mimetype) {
  if (!env.openaiVisionModel) {
    throw new AppError(503, 'AI analysis is not configured');
  }
  const openai = getClient();
  const base64 = imageBuffer.toString('base64');

  try {
    const completion = await openai.chat.completions.parse({
      model: env.openaiVisionModel,
      messages: [
        { role: 'system', content: ANALYSIS_SYSTEM_PROMPT },
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Analyse this jewellery photo.' },
            { type: 'image_url', image_url: { url: `data:${mimetype};base64,${base64}`, detail: 'high' } },
          ],
        },
      ],
      response_format: zodResponseFormat(AnalysisSchema, 'jewellery_analysis'),
    });
    return completion.choices[0].message.parsed;
  } catch (err) {
    throw mapOpenAiError(err);
  }
}

const FIDELITY_BLOCK = `The uploaded jewellery reference is the definitive product. Preserve its exact jewellery type, stone count and apparent arrangement, stone shape and position, prongs and setting, metal colour, band or chain proportions, clasps, and every other distinctive construction detail. Do not redesign, reinterpret or add/remove/resize/reposition any component. Photorealistic, premium e-commerce jewellery photography. No text, logos, or watermarks.`;

// The 7-value asset vocabulary replaces the old 4-value shot_type — metal
// color is now encoded directly in the identifier (e.g. ROSE_FRONT) instead
// of being a separate per-job field, since a single job can now produce both
// Yellow and Rose Gold shots side by side.
export const ASSET_TYPES = [
  'YELLOW_FRONT',
  'YELLOW_HERO_45',
  'ROSE_FRONT',
  'ROSE_HERO_45',
  'PRESENTER_YELLOW_1',
  'PRESENTER_YELLOW_2',
  'PRESENTER_ROSE',
];

// Ring-only output structure — 2 hand-model shots + 4 catalogue shots
// (Front + Side Profile, no 45° Hero), replacing the generic 7-value
// vocabulary above whenever confirmedType === 'RING'. See RING_ASSET_TYPE_SET
// and resolveAssetTypesForJob below for where the branch happens.
export const RING_ASSET_TYPES = [
  'RING_HAND_1',
  'RING_HAND_2',
  'RING_GOLD_FRONT',
  'RING_GOLD_SIDE',
  'RING_ROSE_FRONT',
  'RING_ROSE_SIDE',
];
const RING_ASSET_TYPE_SET = new Set(RING_ASSET_TYPES);

// The 5 selectable "Hand Pose" options (renamed from "Presenter Style" for
// Rings only — no Contemporary/Traditional, no presenter entity at all).
// Hand Pose 2 always uses the NEXT pose in this fixed rotation from whatever
// was picked for Hand Pose 1, guaranteeing "a visibly different pose from
// Hand Pose 1" deterministically without a second admin choice. The default
// (index 0, BACK_OF_HAND_HERO) pairs with index 1 (ELEGANT_DIAGONAL) — which
// is exactly the client's described default Hand Image 1 / Hand Image 2 pair.
export const HAND_POSES = [
  'BACK_OF_HAND_HERO',
  'ELEGANT_DIAGONAL',
  'SIDE_ROTATION',
  'SOFT_RESTING_POSE',
  'FINGER_DETAIL_CLOSEUP',
];
const DEFAULT_HAND_POSE = 'BACK_OF_HAND_HERO';

const HAND_POSE_DESCRIPTIONS = {
  BACK_OF_HAND_HERO: 'a back-of-hand hero pose, viewed from behind the hand with fingers naturally separated',
  ELEGANT_DIAGONAL: 'an elegant diagonal hand position, fingers gently curved, angled naturally across the frame',
  SIDE_ROTATION: 'a gentle side rotation of the hand, turned to reveal the ring from a three-quarter angle',
  SOFT_RESTING_POSE: 'a soft resting hand pose, fingers relaxed and gently curled as if resting on a surface',
  FINGER_DETAIL_CLOSEUP: 'a close-up finger detail pose, framed tightly on the ring finger to showcase the ring design',
};

const HAND_POSE_LABELS = {
  BACK_OF_HAND_HERO: 'Back-of-Hand Hero',
  ELEGANT_DIAGONAL: 'Elegant Diagonal',
  SIDE_ROTATION: 'Side Rotation',
  SOFT_RESTING_POSE: 'Soft Resting Pose',
  FINGER_DETAIL_CLOSEUP: 'Finger Detail Close-up',
};

export function formatHandPose(pose) {
  return HAND_POSE_LABELS[pose] ?? pose;
}

function nextHandPose(pose) {
  const i = HAND_POSES.indexOf(pose);
  return HAND_POSES[(i === -1 ? 0 : i + 1) % HAND_POSES.length];
}

// Mirrors the DB CHECK constraint in the ai_studio_presenters migration —
// must stay in lockstep with it, this is the single source of truth on the
// JS side.
export const ASSET_DISPLAY_ORDER = {
  YELLOW_FRONT: 0,
  YELLOW_HERO_45: 1,
  ROSE_FRONT: 2,
  ROSE_HERO_45: 3,
  PRESENTER_YELLOW_1: 4,
  PRESENTER_YELLOW_2: 5,
  PRESENTER_ROSE: 6,
  RING_HAND_1: 0,
  RING_HAND_2: 1,
  RING_GOLD_FRONT: 2,
  RING_GOLD_SIDE: 3,
  RING_ROSE_FRONT: 4,
  RING_ROSE_SIDE: 5,
};

// Which asset types get generated for a job. Ring is a completely separate,
// fixed output structure (Problem: the generic Yellow/Rose/Presenter shape
// doesn't apply to Rings at all) — 4 images normally, 6 when Rose Gold is
// required, in the exact Hand1/Hand2/Front/Side(/RoseFront/RoseSide) order.
// Every other jewellery type keeps the original logic untouched: Yellow Gold
// catalogue shots are always present, Rose Gold and presenter shots are
// additive, driven purely by the Rose Gold toggle and whether a presenter
// was picked. When both rose gold and a presenter are on, PRESENTER_YELLOW_1
// + PRESENTER_ROSE form a matched pose pair (same pose, two metals);
// PRESENTER_YELLOW_2 (a second, different-angle yellow view) is reserved for
// the no-rose-gold+presenter case, where there's no rose shot to pair
// against instead.
export function resolveAssetTypesForJob({ generateRoseGold, hasPresenter, confirmedType }) {
  if (confirmedType === 'RING') {
    const types = ['RING_HAND_1', 'RING_HAND_2', 'RING_GOLD_FRONT', 'RING_GOLD_SIDE'];
    if (generateRoseGold) types.push('RING_ROSE_FRONT', 'RING_ROSE_SIDE');
    return types;
  }
  const types = ['YELLOW_FRONT', 'YELLOW_HERO_45'];
  if (generateRoseGold) types.push('ROSE_FRONT', 'ROSE_HERO_45');
  if (hasPresenter) {
    types.push('PRESENTER_YELLOW_1');
    types.push(generateRoseGold ? 'PRESENTER_ROSE' : 'PRESENTER_YELLOW_2');
  }
  return types;
}

// RING_HAND_2's metal depends on the Rose Gold toggle (Rose when required,
// Gold otherwise — it's always "the second hand shot", not always Rose) —
// every other asset type is unambiguous from its name alone, so the extra
// param is a no-op for them.
export function metalColorForAssetType(assetType, generateRoseGold = true) {
  if (assetType === 'RING_HAND_2') return generateRoseGold ? 'ROSE' : 'YELLOW';
  if (assetType.startsWith('RING_ROSE_')) return 'ROSE';
  if (RING_ASSET_TYPE_SET.has(assetType)) return 'YELLOW';
  return assetType.startsWith('ROSE_') || assetType === 'PRESENTER_ROSE' ? 'ROSE' : 'YELLOW';
}

// Which of a presenter's 4 reference photos to use as the second input image
// for a given presenter asset type — PRESENTER_YELLOW_1/PRESENTER_ROSE share
// a pose (the matched comparison pair), PRESENTER_YELLOW_2 uses a different
// angle so it isn't a near-duplicate of PRESENTER_YELLOW_1 within the same job.
const PRESENTER_POSE_REFERENCE = {
  PRESENTER_YELLOW_1: 'front_portrait_url',
  PRESENTER_ROSE: 'front_portrait_url',
  PRESENTER_YELLOW_2: 'face_45_url',
};

// Catalogue shots — exact spec supplied by the client, not an invented
// approximation: a metal-matched ivory backdrop (warm for yellow gold, cool
// for rose gold) with named hex values for the base/highlight/shadow, rather
// than pure white or the templates' own vaguer "seamless neutral studio
// background" wording.
const CATALOGUE_SIZE_NOTE = 'Create a premium square jewellery catalogue photograph at 816 × 816px.';

const YELLOW_GOLD_BACKGROUND_NOTE =
  ' Use a clean warm-ivory seamless studio background with base colour #F7F1E7, a subtle #FFFCF7 highlight and a soft #E7D9C6 grounding shadow.';

const ROSE_GOLD_BACKGROUND_NOTE =
  ' Use a clean cool-ivory seamless studio background with base colour #F5F2F0, a subtle #FFFAF8 highlight and a soft #DDD4D1 grounding shadow.';

const CATALOGUE_LIGHTING_NOTE =
  ' Use diffused premium studio lighting from the upper left, realistic metal reflections, controlled diamond sparkle and a soft natural shadow beneath the jewellery. Keep the product centred and occupying approximately 70-78% of the frame. Do not add props, text, hands, packaging, flowers, fabric or decorative elements.';

// 45° Hero Angle — exact spec supplied by the client, replacing the generic
// per-category template.hero_45_prompt entirely for this one asset type
// (its own rotation/elevation/framing geometry, background, and exclusion
// list — self-contained, not layered with CATALOGUE_SIZE_NOTE/backgroundNote/
// CATALOGUE_LIGHTING_NOTE above, which would just contradict its numbers).
// FRONT and presenter prompts are untouched.
const HERO_45_PROMPT =
  'Create a premium square jewellery catalogue image at 816 × 816px using the uploaded jewellery as the exact product reference. ' +
  'Position the jewellery in a three-quarter hero view: rotate the product approximately 40 degrees horizontally from the straight front position, use approximately 15-20 degree camera elevation, keep the main decorative face directed toward the camera, and clearly show the front design, setting height, band thickness and one side profile. ' +
  'Do not rotate the product so far that the primary design becomes hidden. ' +
  'Centre the jewellery precisely, make the product occupy approximately 70-75% of the frame width, and minimise unnecessary empty background space. ' +
  'Add a subtle natural grounding shadow directly below the jewellery. Do not make the jewellery appear to float. ' +
  'Preserve the exact original jewellery design, metal colour, stone count, stone positions, stone shapes, prongs, settings, proportions and band structure. Do not add, remove, relocate or redesign any component. ' +
  'Use a clean seamless warm-ivory studio background with diffused lighting, controlled diamond sparkle, sharp product focus and realistic metal reflections. ' +
  'Do not include hands, presenters, props, packaging, text, flowers, fabric or decorative elements.';

// Presenter shots stay off pure white on purpose — a plain white backdrop
// behind a person reads as a passport photo, not premium jewellery
// presentation. Instead the backdrop colour is chosen to complement whatever
// the presenter reference photo actually shows (skin tone, hair, outfit),
// rather than being hardcoded per presenter (no such field exists on the
// presenters table, and a text instruction lets the model read it directly
// off the attached reference image).
const PRESENTER_BACKGROUND_NOTE =
  ' Use a soft, solid studio backdrop colour that elegantly complements the presenter shown in the attached reference photo — coordinated with their skin tone, hair colour, and styling — refined and premium, not a busy pattern and not pure white.';

// Category-specific presenter placement/exclusion rules (Problem 2: presenter
// shots must show only the uploaded product, no unrelated jewellery). The
// four categories the spec gave exact wording for use it verbatim; every
// other type — including the two new ones, Brooch/Other — gets a generic
// rule of the same shape rather than being left unsupported.
// Ring-only catalogue background — a distinct premium satin system supplied
// by the client (soft fabric folds, subtle depth), not the generic
// warm/cool-ivory seamless-studio notes used by every other jewellery type's
// FRONT/HERO_45 shots. The background must stay secondary to the product and
// never tint the stones — both call out explicitly per client correction,
// not left implicit.
const RING_GOLD_CATALOGUE_BACKGROUND_NOTE =
  ' Use a soft champagne-ivory fabric or a clean neutral studio background — base colour #F4E7DA, a #FFF8F0 highlight and a #D9BDA7 grounding shadow. Keep the background lighter and less saturated than the ring itself, with clear separation between the gold and the backdrop.';
const RING_ROSE_CATALOGUE_BACKGROUND_NOTE =
  ' Use a soft blush-peach fabric or a clean warm-neutral studio background — base colour #E8C4B2, a #F8E7DD highlight and a #C98F76 grounding shadow. Keep sufficient contrast around the ring, and do not let the background tint the diamonds or alter their colour.';
const RING_CATALOGUE_LIGHTING_NOTE =
  ' Use soft, premium studio lighting with natural, controlled product shadows, keeping the ring clearly separated from the background. Avoid busy props, flowers, boxes, unrelated decorative objects or hard reflections. The background must remain secondary to the product.';
const RING_SIZE_NOTE = 'Create a premium square jewellery photograph at 816 × 816px.';

// Hand-pose background is a natural photographic environment picked to suit
// the pose, NOT a brand/metal-colour cue — client correction: "Background
// colour must not change according to the ring's metal colour," so this one
// note is shared by both RING_HAND_1 (Yellow Gold) and RING_HAND_2 (Rose
// Gold) rather than each metal getting its own tinted backdrop.
const RING_HAND_BACKGROUND_NOTE =
  ' Use a natural photographic environment appropriate to the hand pose — for example a neutral studio background, a white or light-grey background, a black studio background, a soft natural interior, or a subtle beige background. Do not force a champagne, ivory, peach or rose-coloured background onto this hand shot, and do not choose the background colour based on the ring\'s metal colour.';
const RING_HAND_LIGHTING_NOTE =
  ' Use soft, natural photographic lighting with the ring sharply focused and the complete ring design clearly visible.';

// Appended as an extra negative instruction on every Ring asset type, on top
// of the generic FIDELITY_BLOCK every asset type already gets — Ring's
// stricter fidelity list (no bangle/bracelet conversion, no mixing in
// elements from pose/background reference images) doesn't apply to any other
// category. Client correction raised this to "highest priority": pose and
// background reference images may only ever influence pose/angle/background,
// never the jewellery design itself, and a visually attractive but
// inaccurate result must never be treated as good enough.
const RING_FIDELITY_EXTRA =
  'The uploaded product image is the only source of truth for the ring design — preserve the exact number, shape and position of every stone, the centre-stone shape and setting, band count and structure, pavé arrangement, curves/crossings/gaps, proportions, setting height, metal thickness and every decorative detail. Do not invent additional stones, remove stones, create a second ring, change the centre stone, change the band design, simplify the construction, or mirror/symmetrise an asymmetric detail. Do not redesign the ring to suit the pose. Pose and background reference images may influence only the hand position, camera angle or background — never the jewellery design. A visually attractive but structurally inaccurate result is not acceptable — do not add, remove or move stones, change the motif or band design, add another band, invent a different setting, convert the ring into a bangle or bracelet, or mix the uploaded ring with any design elements from pose or background reference images.';

const PLACEMENT_RULES = {
  RING: {
    location: "the ring finger",
    excluded:
      'No earrings, necklace, pendant, bracelet, bangle, nose pin, anklet, watch or other ring.',
  },
  EARRINGS: {
    location: 'the ears',
    excluded: 'No necklace, pendant, bracelet, bangle, ring, nose pin or other earrings.',
  },
  NECKLACE: {
    location: 'the neck',
    excluded: 'No earrings, rings, bracelet, bangle, nose pin or additional necklace.',
  },
  PENDANT: {
    location: 'the neck',
    excluded: 'No earrings, rings, bracelet, bangle, nose pin or additional necklace.',
  },
  BRACELET: {
    location: 'one visible wrist',
    excluded: 'No rings, earrings, necklace, watch or additional wrist jewellery.',
  },
  BANGLE: {
    location: 'one visible wrist',
    excluded: 'No rings, earrings, necklace, watch or additional wrist jewellery.',
  },
};
const GENERIC_PLACEMENT_RULE = {
  location: 'its natural position',
  excluded:
    'No other jewellery of any kind — no rings, earrings, necklaces, pendants, bracelets, bangles, nose pins, anklets, watches, or additional pieces.',
};
function placementRuleFor(jewelleryType) {
  return PLACEMENT_RULES[jewelleryType] ?? GENERIC_PLACEMENT_RULE;
}

// Builds one asset's prompt as a structured section object — locked
// (non-editable) sections, an optional category-placement block (presenter
// shots only), an editable "creative" block (Customise Prompt in the Review
// Prompts panel overrides these, and only these), and a negative-instruction
// list. `assemblePrompt` below joins this into the actual string sent to the
// image API; the sections themselves are also returned as-is to the frontend
// for the "Locked Product Rules / Category Placement Rules / Creative
// Instructions / Negative Instructions" preview grouping.
function buildAssetPromptSections({
  assetType,
  confirmedType,
  template,
  presenter,
  creative,
  priorFailure,
  generateRoseGold,
  handPose,
}) {
  const metalColor = metalColorForAssetType(assetType, generateRoseGold);
  const metalColourNote = `The metal colour is ${metalColor.toLowerCase()} gold — preserve it exactly.`;
  const backgroundNote = metalColor === 'ROSE' ? ROSE_GOLD_BACKGROUND_NOTE.trim() : YELLOW_GOLD_BACKGROUND_NOTE.trim();
  const categoryLabel = confirmedType ? formatJewelleryType(confirmedType) : null;

  const locked = {
    productIdentity: 'Use the uploaded product reference as the only jewellery design.',
    confirmedCategory: categoryLabel ? `The confirmed product category is ${categoryLabel}.` : '',
    designPreservation: FIDELITY_BLOCK,
    metalColour: metalColourNote,
    outputSpecs: 'Photorealistic, premium e-commerce jewellery photography. No text, logos, or watermarks.',
  };

  let categoryPlacement = '';
  let creativeDefaults;
  const negativeParts = ['Do not redesign, reinterpret or add/remove/resize/reposition any component.'];
  if (RING_ASSET_TYPE_SET.has(assetType)) negativeParts.push(RING_FIDELITY_EXTRA);

  switch (assetType) {
    case 'YELLOW_FRONT':
    case 'ROSE_FRONT':
      creativeDefaults = {
        background: backgroundNote,
        lighting: CATALOGUE_LIGHTING_NOTE.trim(),
        composition: `${CATALOGUE_SIZE_NOTE} ${template.front_prompt}`,
        presenterPose: '',
        cameraAngle: '',
        additionalInstructions: '',
      };
      negativeParts.push('Do not add props, text, hands, packaging, flowers, fabric or decorative elements.');
      break;
    case 'YELLOW_HERO_45':
    case 'ROSE_HERO_45':
      creativeDefaults = {
        background: '',
        lighting: '',
        composition: HERO_45_PROMPT,
        presenterPose: '',
        cameraAngle: '',
        additionalInstructions: '',
      };
      negativeParts.push(
        'Do not rotate the product so far that the primary design becomes hidden.',
        'Do not make the jewellery appear to float.',
        'Do not include hands, presenters, props, packaging, text, flowers, fabric or decorative elements.',
      );
      break;
    case 'PRESENTER_YELLOW_1':
    case 'PRESENTER_YELLOW_2':
    case 'PRESENTER_ROSE': {
      const rule = placementRuleFor(confirmedType);
      const itemLabel = categoryLabel ? categoryLabel.toLowerCase() : 'jewellery';
      categoryPlacement = `Place only this exact ${itemLabel} on the selected presenter's ${rule.location}. ${rule.excluded} Do not create a similar replacement design. Do not add accessory jewellery for styling. Keep the product clearly visible and unobstructed — do not allow clothing, hair or hands to cover it.`;
      const descriptor =
        presenter?.prompt_descriptor || (presenter ? `a presenter styled as "${presenter.style_label}"` : 'the selected presenter');
      creativeDefaults = {
        background: PRESENTER_BACKGROUND_NOTE.trim(),
        lighting: '',
        composition: `Framed as a ${template.presenter_placement} (${template.presenter_crop} crop). Use realistic product scale and placement.`,
        presenterPose: `Worn naturally by ${descriptor}, matching the attached presenter reference photo.`,
        cameraAngle: '',
        additionalInstructions: '',
      };
      negativeParts.push(rule.excluded, 'Do not replace the uploaded product with a similar design.');
      break;
    }
    case 'RING_HAND_1':
    case 'RING_HAND_2': {
      const isSecondHand = assetType === 'RING_HAND_2';
      const pose = isSecondHand ? nextHandPose(handPose || DEFAULT_HAND_POSE) : handPose || DEFAULT_HAND_POSE;
      const poseText = HAND_POSE_DESCRIPTIONS[pose] ?? HAND_POSE_DESCRIPTIONS[DEFAULT_HAND_POSE];
      categoryPlacement = `Place only this exact ring naturally on the ring finger of a realistic human hand, at a believable scale. Show only the hand, fingers, and a small portion of the wrist when the composition requires it — do not show a face, head, hair, upper body or any clothing-dominated composition. Pose the hand in ${poseText}, keeping the ring's top design clearly visible. Generate realistic hand anatomy with exactly five naturally proportioned fingers, realistic joints and fingernails, and a clean nude manicure. Use exactly one ring — do not add bracelets, watches, additional rings or any other jewellery. The generated ring must retain the exact product design; do not generate a generic ring that merely resembles the reference. Keep the ring on the correct ring finger, sized realistically relative to the finger, with the complete ring design clearly visible and unobstructed.`;
      creativeDefaults = {
        background: RING_HAND_BACKGROUND_NOTE.trim(),
        lighting: RING_HAND_LIGHTING_NOTE.trim(),
        composition: RING_SIZE_NOTE,
        presenterPose: '',
        cameraAngle: '',
        additionalInstructions: '',
      };
      negativeParts.push(
        'Do not show a face, head, hair, upper body or clothing-dominated composition.',
        'Do not add bracelets, watches, additional rings or any other jewellery.',
        'Do not place the ring on the wrong finger or enlarge it unrealistically.',
        'Do not create distorted fingers or unrealistic hand anatomy.',
        'Do not apply a background colour tied to the ring\'s metal colour — the background must be a natural, neutral photographic environment, not champagne, ivory, peach or rose-coloured.',
      );
      if (isSecondHand) negativeParts.push('Use a hand pose visibly different from Hand Pose 1 — do not reuse the same pose or camera angle.');
      break;
    }
    case 'RING_GOLD_FRONT':
    case 'RING_ROSE_FRONT': {
      const isRose = assetType === 'RING_ROSE_FRONT';
      creativeDefaults = {
        background: (isRose ? RING_ROSE_CATALOGUE_BACKGROUND_NOTE : RING_GOLD_CATALOGUE_BACKGROUND_NOTE).trim(),
        lighting: RING_CATALOGUE_LIGHTING_NOTE.trim(),
        // True Front View — a direct, symmetrical view of the ring's
        // decorative top, NOT the upright three-quarter stance used for Side
        // Profile below. Client correction: the model previously stood the
        // ring upright for this shot too, making Front and Side
        // near-indistinguishable — this composition is deliberately the
        // opposite of Side Profile's in every stated respect.
        composition: `${RING_SIZE_NOTE} Photograph the ring's decorative top in a true, direct front view: the camera looks straight at the decorative face of the ring, as if looking down onto it, not standing it upright on its band. Position the centre stone in the exact visual centre of the frame, with the decorative bands extending clearly to the left and right so the front design reads approximately horizontal. Show the complete ring face and the full stone arrangement with minimal perspective distortion. The circular band opening may be partially visible behind the decorative face, but it must never be the dominant shape in the frame.`,
        presenterPose: '',
        cameraAngle: '',
        additionalInstructions: '',
      };
      negativeParts.push(
        'Do not add props, text, hands, packaging or decorative elements beyond the satin backdrop.',
        'Do not stand the ring vertically upright on its band for this shot.',
        'Do not display the circular band opening as the main shape of the image.',
        'Do not rotate the ring to a 30-45 degree angle for this shot.',
        'Do not use the same orientation as the Side Profile shot — this is a true, direct front view, not a three-quarter view.',
      );
      break;
    }
    case 'RING_GOLD_SIDE':
    case 'RING_ROSE_SIDE': {
      const isRose = assetType === 'RING_ROSE_SIDE';
      // Hardcoded opposite rotation directions (rather than a vague "make it
      // different" instruction) so the Gold and Rose Side Profile shots are
      // reliably distinguishable from each other, on top of each already
      // being required to differ sharply from its own Front View.
      const directionNote = isRose
        ? ' Rotate the ring toward the opposite side direction from the Gold Side Profile shot (if Gold faced left, face right, and vice versa) so the two Side Profile images are clearly distinguishable.'
        : '';
      creativeDefaults = {
        background: (isRose ? RING_ROSE_CATALOGUE_BACKGROUND_NOTE : RING_GOLD_CATALOGUE_BACKGROUND_NOTE).trim(),
        lighting: RING_CATALOGUE_LIGHTING_NOTE.trim(),
        // True Side Profile — rotated a near-full 80-90° away from the Front
        // View (not the softer "three-quarter" rotation used previously),
        // since a three-quarter angle was indistinguishable from Front View
        // in practice.
        composition: `${RING_SIZE_NOTE} Stand the ring upright on the lower edge of its band and rotate it approximately 80-90 degrees away from the front view — a true side profile, not a slight three-quarter rotation.${directionNote} Clearly show the circular band opening, the band thickness, the height of the centre-stone setting, the side construction and under-gallery, and how the decorative upper bands connect to the main band, while preserving the complete decorative motif. Use a clean catalogue composition with different fabric folds from the matching Front View shot.`,
        presenterPose: '',
        cameraAngle: '',
        additionalInstructions: '',
      };
      negativeParts.push(
        'Do not use a front-facing angle for this shot.',
        'Do not use a slight three-quarter rotation — rotate close to 90 degrees so the band opening is unmistakably visible.',
        'Do not hide the band opening or flatten the setting.',
        'Do not repeat the orientation used for the Front View shot — the two must be visually and structurally different.',
      );
      break;
    }
    default:
      throw new Error(`Unknown asset type "${assetType}"`);
  }

  if (priorFailure) {
    negativeParts.push(`A previous attempt was rejected: ${priorFailure}. Correct this specific issue.`);
  }

  return {
    locked,
    categoryPlacement,
    creative: { ...creativeDefaults, ...(creative ?? {}) },
    negativeInstructions: negativeParts,
  };
}

function assemblePrompt({ locked, categoryPlacement, creative, negativeInstructions }) {
  return [
    locked.productIdentity,
    locked.confirmedCategory,
    locked.designPreservation,
    locked.metalColour,
    creative.composition,
    creative.cameraAngle,
    creative.presenterPose,
    categoryPlacement,
    creative.background,
    creative.lighting,
    creative.additionalInstructions,
    ...negativeInstructions,
    locked.outputSpecs,
  ]
    .filter(Boolean)
    .join(' ');
}

function buildPrompt({ assetType, confirmedType, template, presenter, creative, priorFailure, generateRoseGold, handPose }) {
  return assemblePrompt(
    buildAssetPromptSections({ assetType, confirmedType, template, presenter, creative, priorFailure, generateRoseGold, handPose }),
  );
}

// Computes every planned asset's prompt without any DB/API calls — powers
// both the Review Prompts preview endpoint and what confirmJob persists onto
// each asset row at confirm time (so what's shown is exactly what's sent).
export function previewPromptsForJob({ confirmedType, template, presenter, generateRoseGold, handPose, overridesByAssetType }) {
  const hasPresenter = !!presenter;
  const assetTypes = resolveAssetTypesForJob({ generateRoseGold, hasPresenter, confirmedType });
  return assetTypes.map((assetType) => {
    const override = overridesByAssetType?.[assetType];
    const sections = buildAssetPromptSections({
      assetType,
      confirmedType,
      template,
      presenter,
      creative: override,
      generateRoseGold,
      handPose,
    });
    return {
      assetType,
      metalColor: metalColorForAssetType(assetType, generateRoseGold),
      mode: override ? 'customised' : 'recommended',
      lockedProductRules: [sections.locked.productIdentity, sections.locked.confirmedCategory, sections.locked.designPreservation, sections.locked.metalColour, sections.locked.outputSpecs].filter(Boolean),
      categoryPlacementRules: sections.categoryPlacement ? [sections.categoryPlacement] : [],
      creativeInstructions: sections.creative,
      negativeInstructions: sections.negativeInstructions,
      finalPrompt: assemblePrompt(sections),
    };
  });
}

function extensionFor(mimetype) {
  return mimetype === 'image/png' ? 'png' : mimetype === 'image/webp' ? 'webp' : 'jpg';
}

// One images.edit() call per asset, always against the ORIGINAL jewellery
// reference buffer — never a previously-generated shot (plan §4 correction:
// "Every generated image must use the original reference image"). Presenter
// asset types additionally pass the presenter's own reference photo as a
// second input image — gpt-image-2 accepts an array of images per edit call
// — so the model composites the real jewellery onto a real presenter photo
// rather than only working from a text description. No resize here; full-res
// output is stored as-is, variant derivation happens once on import.
export async function generateShot({
  referenceBuffer,
  mimetype,
  template,
  assetType,
  confirmedType,
  presenter,
  presenterReferenceBuffer,
  creative,
  priorFailure,
  promptOverride,
  generateRoseGold,
  handPose,
}) {
  const openai = getClient();
  const extension = extensionFor(mimetype);
  // Prefer the prompt already reviewed/confirmed on the Review Prompts panel
  // and persisted at confirm time (assembled_final_prompt) — guarantees what
  // the admin saw is exactly what gets sent. Only recomputed when there's a
  // prior-failure correction to inject (a retry after failed validation) or
  // for the rare case nothing was persisted yet.
  const prompt =
    promptOverride ??
    buildPrompt({ assetType, confirmedType, template, presenter, creative, priorFailure, generateRoseGold, handPose });

  try {
    const referenceFile = await toFile(referenceBuffer, `reference.${extension}`, { type: mimetype });
    const image = presenterReferenceBuffer
      ? [referenceFile, await toFile(presenterReferenceBuffer, `presenter.jpeg`, { type: 'image/jpeg' })]
      : referenceFile;

    const response = await openai.images.edit({
      model: env.openaiImageModel,
      image,
      prompt,
      size: '1024x1024',
      quality: 'medium',
      background: 'opaque',
      output_format: 'png',
      n: 1,
    });
    const b64 = response.data?.[0]?.b64_json;
    if (!b64) throw new AppError(502, 'Image generation did not return a result');
    return { buffer: Buffer.from(b64, 'base64'), prompt };
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw mapOpenAiError(err);
  }
}

export function presenterReferenceKeyFor(assetType) {
  return PRESENTER_POSE_REFERENCE[assetType] ?? null;
}

const ValidationSchema = z.object({
  validationStatus: z.enum(['passed', 'warning', 'failed']),
  detectedJewelleryTypes: z.array(z.enum(JEWELLERY_TYPES)),
  expectedJewelleryType: z.enum(JEWELLERY_TYPES),
  additionalOrnamentsDetected: z.array(z.string()),
  placementStatus: z.enum(['correct', 'incorrect', 'partially_obscured', 'not_applicable']),
  metalColourStatus: z.enum(['correct', 'incorrect']),
  productSimilarityScore: z.number().min(0).max(1),
  validationMessages: z.array(z.string()),
});

const VALIDATION_SYSTEM_PROMPT = `You are a jewellery product-photo quality reviewer. You are shown two images: the GENERATED result (first image) and the ORIGINAL product reference photo (second image), plus the expected jewellery category and metal colour as text. Check: (1) the generated image's jewellery category matches what was expected, (2) no additional or unrelated jewellery is visible anywhere in the image beyond the one confirmed product — rings, earrings, necklaces, pendants, bracelets, bangles, nose pins, anklets, watches, or any other piece, (3) the product is correctly placed, fully visible, sharply focused, and not obscured by hands, hair or clothing, (4) the metal colour matches what was requested, (5) the generated jewellery closely matches the original reference's design — same stone count, stone shapes, settings, prongs and proportions, not a similar replacement. Set validationStatus to "failed" for a wrong category or any additional ornament detected, "warning" for a real but minor issue (e.g. partial obstruction, slight colour mismatch), and "passed" only when everything checks out. Always include specific, actionable validationMessages, e.g. "Failed: Expected Ring, but Bracelet was detected." or "Warning: Ring is partially covered by the presenter's finger." Additional per-asset-type instructions may follow in the user message — they refine, and can override, rule (3) above for that specific image (e.g. a Ring hand-model shot is SUPPOSED to show a hand).`;

// Ring hand shots are SUPPOSED to show a hand — rule (3) in the system
// prompt above (generic "not obscured by hands") would otherwise wrongly
// flag every one of them. Front/Side shots each get an explicit orientation
// checklist — a single vision call only sees ITS OWN generated image (no
// true side-by-side comparison against its sibling shot is implemented),
// but a Front that actually came out as a rotated/upright view will fail its
// own required-features list below, and likewise for a Side that came out
// front-facing — which in practice catches the same "these two look the
// same" failure mode the client described, without a separate cross-asset
// validation pass.
function ringValidationContextFor(assetType) {
  if (assetType === 'RING_HAND_1' || assetType === 'RING_HAND_2') {
    return ' This is a Ring hand-model shot — a hand IS expected and must not be flagged as an obstruction. The background is a natural, neutral photographic environment (studio grey/white/black, soft interior, subtle beige) and must NOT be flagged just for not matching a metal-coloured catalogue background — only flag the background if it is champagne/ivory/peach/rose-tinted (i.e. tied to the metal colour), which is explicitly disallowed here. Pass only when: exactly one ring is visible; the ring closely matches the uploaded product reference (same stones, same band structure — not just a loosely similar ring); the correct metal colour is used; no face, head, hair or upper body is visible; the ring sits naturally on the correct ring finger. Set validationStatus to "failed" (not "warning") when: more than one ring appears, the metal colour is wrong for this shot (Rose Gold appearing where Yellow Gold was expected or vice versa), the stone arrangement or band structure has changed from the reference, the ring is too small/unclear to verify against the reference, or the generated ring is only loosely similar to the reference rather than an accurate reproduction.';
  }
  if (assetType === 'RING_GOLD_FRONT' || assetType === 'RING_ROSE_FRONT') {
    return ' This is a Ring TRUE FRONT VIEW — a direct, symmetrical view of the decorative top, not an upright three-quarter angle. It passes only when: the decorative ring face is the dominant visible element; the centre stone is centrally positioned; the left and right decorative bands are clearly visible extending outward; the ring is viewed directly from above/toward its decorative face; the image does NOT resemble an upright side view. Set validationStatus to "failed" (not "warning") if the ring is standing upright on its band, if the circular band opening is the dominant shape, or if this looks like a three-quarter/rotated angle rather than a true direct front view — this is a common and important failure mode to catch.';
  }
  if (assetType === 'RING_GOLD_SIDE' || assetType === 'RING_ROSE_SIDE') {
    return ' This is a Ring TRUE SIDE PROFILE — rotated close to 90 degrees from the front view, not a slight three-quarter rotation. It passes only when: the ring stands upright; the circular band opening is clearly visible; band thickness is visible; the centre-stone setting height is visible; the side construction/under-gallery is visible; the view reads as rotated roughly 80-90 degrees from a front-on view. Set validationStatus to "failed" (not "warning") if the shot is front-facing or only slightly rotated (a near-duplicate of a front view), if the band opening is hidden, or if the setting appears flattened rather than showing real height.';
  }
  return '';
}

// Runs after every successful generation (Problem 1 & 2 downstream): a second
// vision call comparing the freshly generated image against the original
// product reference, checking category/ornament/placement/metal/similarity.
// Never blocks the asset from being READY/viewable — this is an orthogonal
// gate on *import*, applied by the controller (see importAsset/updateAssetSelection).
export async function validateGeneratedImage({
  generatedBuffer,
  referenceBuffer,
  referenceMimetype,
  confirmedType,
  metalColor,
  assetType,
}) {
  if (!env.openaiVisionModel) {
    throw new AppError(503, 'AI validation is not configured');
  }
  const openai = getClient();
  const generatedBase64 = generatedBuffer.toString('base64');
  const referenceBase64 = referenceBuffer.toString('base64');

  try {
    const completion = await openai.chat.completions.parse({
      model: env.openaiVisionModel,
      messages: [
        { role: 'system', content: VALIDATION_SYSTEM_PROMPT },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `Expected jewellery category: ${confirmedType}. Expected metal colour: ${metalColor}. Asset type: ${assetType}. The first image is the generated result; the second image is the original product reference.${ringValidationContextFor(assetType)}`,
            },
            { type: 'image_url', image_url: { url: `data:image/png;base64,${generatedBase64}`, detail: 'high' } },
            {
              type: 'image_url',
              image_url: { url: `data:${referenceMimetype};base64,${referenceBase64}`, detail: 'high' },
            },
          ],
        },
      ],
      response_format: zodResponseFormat(ValidationSchema, 'generation_validation'),
    });
    return completion.choices[0].message.parsed;
  } catch (err) {
    throw mapOpenAiError(err);
  }
}
