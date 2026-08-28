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
};

// Which asset types get generated for a job, driven purely by the Rose Gold
// toggle and whether a presenter was picked. Yellow Gold catalogue shots are
// always present — Rose Gold and presenter shots are additive. When both
// rose gold and a presenter are on, PRESENTER_YELLOW_1 + PRESENTER_ROSE form
// a matched pose pair (same pose, two metals); PRESENTER_YELLOW_2 (a second,
// different-angle yellow view) is reserved for the no-rose-gold+presenter
// case, where there's no rose shot to pair against instead.
export function resolveAssetTypesForJob({ generateRoseGold, hasPresenter }) {
  const types = ['YELLOW_FRONT', 'YELLOW_HERO_45'];
  if (generateRoseGold) types.push('ROSE_FRONT', 'ROSE_HERO_45');
  if (hasPresenter) {
    types.push('PRESENTER_YELLOW_1');
    types.push(generateRoseGold ? 'PRESENTER_ROSE' : 'PRESENTER_YELLOW_2');
  }
  return types;
}

export function metalColorForAssetType(assetType) {
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
function buildAssetPromptSections({ assetType, confirmedType, template, presenter, creative, priorFailure }) {
  const metalColor = metalColorForAssetType(assetType);
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

function buildPrompt({ assetType, confirmedType, template, presenter, creative, priorFailure }) {
  return assemblePrompt(buildAssetPromptSections({ assetType, confirmedType, template, presenter, creative, priorFailure }));
}

// Computes every planned asset's prompt without any DB/API calls — powers
// both the Review Prompts preview endpoint and what confirmJob persists onto
// each asset row at confirm time (so what's shown is exactly what's sent).
export function previewPromptsForJob({ confirmedType, template, presenter, generateRoseGold, overridesByAssetType }) {
  const hasPresenter = !!presenter;
  const assetTypes = resolveAssetTypesForJob({ generateRoseGold, hasPresenter });
  return assetTypes.map((assetType) => {
    const override = overridesByAssetType?.[assetType];
    const sections = buildAssetPromptSections({
      assetType,
      confirmedType,
      template,
      presenter,
      creative: override,
    });
    return {
      assetType,
      metalColor: metalColorForAssetType(assetType),
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
}) {
  const openai = getClient();
  const extension = extensionFor(mimetype);
  // Prefer the prompt already reviewed/confirmed on the Review Prompts panel
  // and persisted at confirm time (assembled_final_prompt) — guarantees what
  // the admin saw is exactly what gets sent. Only recomputed when there's a
  // prior-failure correction to inject (a retry after failed validation) or
  // for the rare case nothing was persisted yet.
  const prompt = promptOverride ?? buildPrompt({ assetType, confirmedType, template, presenter, creative, priorFailure });

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

const VALIDATION_SYSTEM_PROMPT = `You are a jewellery product-photo quality reviewer. You are shown two images: the GENERATED result (first image) and the ORIGINAL product reference photo (second image), plus the expected jewellery category and metal colour as text. Check: (1) the generated image's jewellery category matches what was expected, (2) no additional or unrelated jewellery is visible anywhere in the image beyond the one confirmed product — rings, earrings, necklaces, pendants, bracelets, bangles, nose pins, anklets, watches, or any other piece, (3) the product is correctly placed, fully visible, sharply focused, and not obscured by hands, hair or clothing, (4) the metal colour matches what was requested, (5) the generated jewellery closely matches the original reference's design — same stone count, stone shapes, settings, prongs and proportions, not a similar replacement. Set validationStatus to "failed" for a wrong category or any additional ornament detected, "warning" for a real but minor issue (e.g. partial obstruction, slight colour mismatch), and "passed" only when everything checks out. Always include specific, actionable validationMessages, e.g. "Failed: Expected Ring, but Bracelet was detected." or "Warning: Ring is partially covered by the presenter's finger."`;

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
              text: `Expected jewellery category: ${confirmedType}. Expected metal colour: ${metalColor}. Asset type: ${assetType}. The first image is the generated result; the second image is the original product reference.`,
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
