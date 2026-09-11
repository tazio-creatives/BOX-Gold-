import OpenAI, { toFile } from 'openai';
import { zodResponseFormat } from 'openai/helpers/zod';
import { z } from 'zod';
import sharp from 'sharp';
import { env } from '../config/env.js';
import { AppError } from '../utils/AppError.js';
import { query } from '../config/db.js';
import { storageProvider } from '../providers/storage/index.js';
import { keyFromUrl } from '../utils/storageKey.js';
import { primaryDimensionsFor, INCLUSION_RULES } from '../validators/productSizeMeasurements.validators.js';

// Deliberately self-contained, not importing anything from aiStudioService.js
// — Product Size Image is its own generation pipeline (plan: "Product Size
// Image is now its own fully decoupled subsystem"), so this file owns its
// own OpenAI client, prompt, and validation call rather than reusing/risking
// any change to the already heavily-tuned AI Studio prompt assembler.
const REQUEST_TIMEOUT_MS = 600_000;
let client = null;
function getClient() {
  if (!env.openaiApiKey) throw new AppError(503, 'Product Size Image generation is not configured');
  if (!client) client = new OpenAI({ apiKey: env.openaiApiKey, timeout: REQUEST_TIMEOUT_MS, maxRetries: 1 });
  return client;
}

function mapOpenAiError(err) {
  console.error('Product Size Image OpenAI call failed:', err?.status ?? '', err?.message ?? err);
  return new AppError(502, 'Product Size Image generation failed — please try again.');
}

// The AI's only job: render the exact product, isolated, front-on, on a
// background clean enough for deterministic bounding-box detection
// afterwards. Every ruler mark, tick, number and label is added later by
// pure code — never requested from the model (plan's core constraint).
const PRODUCT_SIZE_BASE_PROMPT = [
  'Use the uploaded product reference as the only jewellery design.',
  'Preserve its exact jewellery type, overall structure, shape, metal colour, stone count, stone shapes, stone placement, decorative motif, proportions, and any loops, hooks or clasps exactly as shown. Do not redesign, reinterpret, simplify or add/remove/resize/reposition any component.',
  'Create a premium square catalogue photograph at 1024 x 1024px showing the product centred, in a direct front-on orthographic view — camera looking straight at the product with no rotation, no three-quarter angle, and no perspective tilt.',
  'Use a pure white or very light neutral, completely flat and evenly lit background with no gradient, vignette, texture or fabric.',
  'Do not add a drop shadow, contact shadow, reflection or glow beneath or around the product.',
  'Keep the complete product inside the frame with generous safe margins on every side — do not crop any part of it and do not let it touch the frame edge.',
  'Sharp, evenly lit focus on the entire product.',
  'Do not include a hand, presenter, model, props, packaging, fabric backdrop, text, logo or watermark.',
  'Photorealistic, premium e-commerce jewellery photography.',
].join(' ');

export async function generateProductSizeBase(referenceBuffer, mimetype) {
  const openai = getClient();
  try {
    const extension = mimetype === 'image/png' ? 'png' : mimetype === 'image/webp' ? 'webp' : 'jpg';
    const referenceFile = await toFile(referenceBuffer, `reference.${extension}`, { type: mimetype });
    const response = await openai.images.edit({
      model: env.openaiImageModel,
      image: referenceFile,
      prompt: PRODUCT_SIZE_BASE_PROMPT,
      size: '1024x1024',
      quality: 'medium',
      background: 'opaque',
      output_format: 'png',
      n: 1,
    });
    const b64 = response.data?.[0]?.b64_json;
    if (!b64) throw new AppError(502, 'Product Size Image generation did not return a result');
    return Buffer.from(b64, 'base64');
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw mapOpenAiError(err);
  }
}

const ValidationSchema = z.object({
  status: z.enum(['passed', 'warning', 'failed']),
  reasons: z.array(z.string()),
});

const VALIDATION_SYSTEM_PROMPT =
  'You are a technical product-photo quality reviewer for a jewellery size-guide image. You are shown two images: the GENERATED result (first) and the ORIGINAL product reference (second). This generated image will have a precise ruler and measurement overlay added to it by separate software, so its geometry must be trustworthy. The reference image is an ordinary product photo — it may itself have an imperfect background, a shadow, a reflection, styling, or props; NONE of that is relevant and must never be a reason to fail or warn. Use the reference ONLY to judge whether the jewellery design itself (shape, stone count, stone shapes, stone placement, metal colour, proportions) was preserved — ignore its background, lighting and photographic style entirely. Then, judging the GENERATED image alone, check: (1) the jewellery design matches the reference exactly, not a similar replacement; (2) the GENERATED image\'s own background is a clean, flat, uniformly lit white or very light neutral surface with no visible shadow, reflection, gradient or texture; (3) the product in the GENERATED image is shown in a direct front-on orthographic view — NOT rotated, NOT a three-quarter angle, NOT tilted, with no meaningful perspective distortion; (4) the product in the GENERATED image is fully visible, not cropped, and has a clear safe margin from every frame edge; (5) the GENERATED image is a single product with no hand, presenter, props or extra objects. Set status to "failed" only for a real design mismatch, a rotated/angled/perspective GENERATED view, cropping in the GENERATED image, or a GENERATED background too inconsistent to reliably detect the product boundary against. Set "warning" for a real but minor issue in the GENERATED image (e.g. a faint shadow that likely will not affect measurement). Set "passed" whenever the GENERATED image itself satisfies every check, regardless of the reference photo\'s own quality. Always include specific reasons, e.g. "Product is not in a direct front-on view." or "Background is not clean enough to detect product boundaries reliably."';

// Purpose-built vision check — separate from AI Studio's validateGeneratedImage
// (whose criteria, category/ornament/placement/metal-colour-variant checks,
// don't fit this single always-front-on asset). This is legitimate use of AI
// for photo QUALITY judgment (design fidelity, orientation, cleanliness) —
// distinct from, and never used for, producing the ruler marks/numbers/text
// themselves, which are 100% deterministic (see composeMeasurementImage).
export async function validateProductSizeBase({ generatedBuffer, referenceBuffer, referenceMimetype }) {
  if (!env.openaiVisionModel) throw new AppError(503, 'Product Size Image validation is not configured');
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
            { type: 'text', text: 'Review this generated Product Size Image base photo against the reference.' },
            { type: 'image_url', image_url: { url: `data:image/png;base64,${generatedBase64}`, detail: 'high' } },
            { type: 'image_url', image_url: { url: `data:${referenceMimetype};base64,${referenceBase64}`, detail: 'high' } },
          ],
        },
      ],
      response_format: zodResponseFormat(ValidationSchema, 'product_size_validation'),
    });
    return completion.choices[0].message.parsed;
  } catch (err) {
    throw mapOpenAiError(err);
  }
}

// Deterministic (no AI): samples the 4 corner pixels as the background
// colour (AI output is rarely exact #FFFFFF) and uses sharp's own pixel-
// threshold trim to find exactly where the product sits. Returns null when
// the result is untrustworthy — trim didn't shrink the canvas at all
// (background wasn't clean), or the detected box is implausibly large
// (>=95% of the canvas — same conclusion) or implausibly small (<=5% —
// trim likely ate into the product itself, common with pale/white-metal
// pieces against a near-white background).
// Corner sample size (px) — averaging a small patch per corner instead of a
// single pixel absorbs the faint anti-aliasing/gradient noise real "white
// background" generations often have right at the very corner, which a
// single-pixel sample would otherwise pick up as the trim colour and throw
// the whole detection off. Clamped to the canvas so this still works on a
// (theoretically) tiny generated image.
const CORNER_SAMPLE = 16;

async function sampleCornerBackground(buffer, canvasWidth, canvasHeight) {
  const size = Math.max(1, Math.min(CORNER_SAMPLE, canvasWidth, canvasHeight));
  const corners = await Promise.all(
    [
      { left: 0, top: 0 },
      { left: canvasWidth - size, top: 0 },
      { left: 0, top: canvasHeight - size },
      { left: canvasWidth - size, top: canvasHeight - size },
    ].map((pos) =>
      sharp(buffer).extract({ ...pos, width: size, height: size }).raw().toBuffer({ resolveWithObject: true }),
    ),
  );
  const channels = corners[0].info.channels;
  const sums = [0, 0, 0];
  let pixelCount = 0;
  for (const { data } of corners) {
    for (let i = 0; i < data.length; i += channels) {
      sums[0] += data[i];
      sums[1] += data[i + 1];
      sums[2] += data[i + 2];
      pixelCount += 1;
    }
  }
  return { r: Math.round(sums[0] / pixelCount), g: Math.round(sums[1] / pixelCount), b: Math.round(sums[2] / pixelCount) };
}

async function tryTrim(buffer, background, threshold, canvasWidth, canvasHeight) {
  let trimmed;
  try {
    trimmed = await sharp(buffer).trim({ background, threshold }).toBuffer({ resolveWithObject: true });
  } catch {
    return null;
  }
  const { info } = trimmed;
  if (info.trimOffsetLeft === 0 && info.trimOffsetTop === 0 && info.width === canvasWidth && info.height === canvasHeight) {
    return null; // nothing was trimmed
  }
  const box = { left: -info.trimOffsetLeft, top: -info.trimOffsetTop, width: info.width, height: info.height };
  const canvasArea = canvasWidth * canvasHeight;
  const boxArea = box.width * box.height;
  if (boxArea >= canvasArea * 0.95 || boxArea <= canvasArea * 0.05) return null;
  return box;
}

export async function detectProductBoundingBox(buffer) {
  const threshold = env.productSizeImageTrimThreshold;
  const { width: canvasWidth, height: canvasHeight } = await sharp(buffer).metadata();

  const background = await sampleCornerBackground(buffer, canvasWidth, canvasHeight);
  let box = await tryTrim(buffer, background, threshold, canvasWidth, canvasHeight);

  // Fallback: the generation prompt explicitly asks for a pure white
  // background, so if the corner-sampled colour didn't produce a usable
  // trim (e.g. a stray artifact skewed the sample away from true white),
  // retry once against literal white with a more permissive threshold
  // before giving up — this is what actually recovers otherwise-clean
  // generations that would previously have been rejected outright.
  if (!box) {
    box = await tryTrim(buffer, { r: 255, g: 255, b: 255 }, Math.max(threshold, 24), canvasWidth, canvasHeight);
  }
  if (!box) return null;

  return { ...box, canvasWidth, canvasHeight };
}

function toMm(value, unit) {
  return unit === 'cm' ? value * 10 : value;
}

// Fixed canvas layout — same margins every time, not data-dependent, so the
// ruler always occupies the same visual footprint regardless of product
// size (plan point 4's "fixed measurement canvas"). 1600px master (up from
// 1200) — matches imageProcessingService.js's own 'large' variant target
// (VARIANT_WIDTHS.large = 1600), which was previously unable to reach its
// own target width because withoutEnlargement:true can't upscale a smaller
// source; the PDP gallery already prefers 'large', so this alone raises the
// resolution actually shown on the storefront, no gallery/variant change
// needed.
const CANVAS_SIZE = 1600;
const LEFT_MARGIN = 220;
// Larger top/bottom margins than a first pass would suggest — the approved
// reference keeps the product+ruler group to roughly 55–65% of the canvas
// (generous whitespace on every edge), not filling the frame edge to edge.
const BOTTOM_MARGIN = 270;
const TOP_MARGIN = 270;
// Wide enough to hold the callout column (dimension arrow + label, and the
// included/excluded-part annotation) to the right of the product — matches
// the approved mockup's layout, where those live in open space beside the
// piece rather than overlapping it.
const RIGHT_MARGIN = 380;

// Tick/line/text hierarchy for the 1600px master — thicker and larger than
// the old 1200px constants so the ruler reads as a real physical measuring
// tool rather than a thin technical-drawing line (previous values, scaled
// for reference: strokeMajor 3, tickMajorLen 22 — both roughly doubled).
const AXIS_STROKE = 5.5;
const CM_TICK_LEN = 34;
const CM_TICK_STROKE = 5.5;
const MM5_TICK_LEN = 24;
const MM5_TICK_STROKE = 4;
const MM_TICK_LEN = 15;
const MM_TICK_STROKE = 3;
const CM_NUMBER_SIZE = 36;
const HEADING_SIZE = 34;
const DIM_VALUE_SIZE = 30;
const NOTE_SIZE = 26;
const GUIDE_STROKE = 3.5;
const ARROW_STROKE = 4.5;

// Spec: "maximumScaleCm = ceil(measurementInMm / 10)" — the ruler extends
// only as far as the rounded-up centimetre the declared value needs, never
// a fixed 0–3cm regardless of the actual measurement (the previous formula
// always added one extra unused centimetre beyond that).
function rulerLengthMmFor(valueMm) {
  if (valueMm == null) return null;
  return Math.max(10, Math.ceil(valueMm / 10) * 10);
}

function categoryTitleFor(jewelleryType) {
  const titles = {
    RING: 'RING TOP',
    PENDANT: 'PENDANT BODY',
    EARRINGS: 'EARRING',
    BANGLE: 'BANGLE',
    BRACELET: 'BRACELET',
    NECKLACE: 'NECKLACE',
    CHAIN: 'CHAIN',
  };
  return titles[jewelleryType] ?? 'PRODUCT';
}

function escapeXml(text) {
  return String(text).replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]));
}

// Builds the deterministic L-shaped ruler + guides + labels as an SVG string
// (rasterized via sharp's bundled librsvg, no extra dependency). Every
// number drawn here is either a fixed geometric constant (ticks, origin) or
// taken verbatim from the admin's declared measurement values — never
// derived from a detected pixel measurement (plan: "guide lines must match
// the manually entered values" / "do not display an invented measurement").
function buildRulerOverlaySvg({
  jewelleryType,
  unit,
  measurements,
  pxPerMm,
  origin,
  rulerLengthMmX,
  rulerLengthMmY,
  inclusionNote,
  measuredTopY,
  measuredBottomY,
  measuredHeightValue,
  measuredRightX,
  measuredWidthValue,
  loopCallout,
}) {
  const dark = '#1c1c1c';
  const dash = 'stroke-dasharray="10 8"';

  const parts = [];

  // Horizontal ruler baseline + vertical ruler baseline — each extends only
  // as far as its own axis's declared value needs (rulerLengthMmX/Y), not a
  // shared fixed length, since a tall-narrow or short-wide product needs a
  // different range on each axis (plan: "the horizontal and vertical ruler
  // ranges may be different").
  parts.push(
    `<line x1="${origin.x}" y1="${origin.y}" x2="${origin.x + rulerLengthMmX * pxPerMm}" y2="${origin.y}" stroke="${dark}" stroke-width="${AXIS_STROKE}" stroke-linecap="round" />`,
  );
  parts.push(
    `<line x1="${origin.x}" y1="${origin.y}" x2="${origin.x}" y2="${origin.y - rulerLengthMmY * pxPerMm}" stroke="${dark}" stroke-width="${AXIS_STROKE}" stroke-linecap="round" />`,
  );

  // Ticks + numbers — three tiers per mm: full-length+numbered at every
  // 10mm (1cm), medium at the halfway 5mm point, short for the rest, always
  // exactly ten equal mm divisions per cm (plan section 4).
  function tickStyle(mm) {
    if (mm % 10 === 0) return { len: CM_TICK_LEN, stroke: CM_TICK_STROKE, major: true };
    if (mm % 5 === 0) return { len: MM5_TICK_LEN, stroke: MM5_TICK_STROKE, major: false };
    return { len: MM_TICK_LEN, stroke: MM_TICK_STROKE, major: false };
  }

  for (let mm = 0; mm <= rulerLengthMmX; mm += 1) {
    const { len, stroke, major } = tickStyle(mm);
    const hx = origin.x + mm * pxPerMm;
    parts.push(`<line x1="${hx}" y1="${origin.y}" x2="${hx}" y2="${origin.y + len}" stroke="${dark}" stroke-width="${stroke}" />`);
    if (major && mm > 0) {
      parts.push(`<text x="${hx}" y="${origin.y + CM_TICK_LEN + CM_NUMBER_SIZE + 6}" font-size="${CM_NUMBER_SIZE}" font-family="Liberation Sans, Arial, sans-serif" fill="${dark}" text-anchor="middle">${mm / 10}</text>`);
    }
  }
  for (let mm = 0; mm <= rulerLengthMmY; mm += 1) {
    const { len, stroke, major } = tickStyle(mm);
    const vy = origin.y - mm * pxPerMm;
    parts.push(`<line x1="${origin.x}" y1="${vy}" x2="${origin.x - len}" y2="${vy}" stroke="${dark}" stroke-width="${stroke}" />`);
    if (major && mm > 0) {
      parts.push(`<text x="${origin.x - CM_TICK_LEN - 14}" y="${vy + CM_NUMBER_SIZE * 0.35}" font-size="${CM_NUMBER_SIZE}" font-family="Liberation Sans, Arial, sans-serif" fill="${dark}" text-anchor="end">${mm / 10}</text>`);
    }
  }

  // "0" and "Cm" stacked directly below it, right at the corner — matches
  // the approved reference (both rulers share this one corner label).
  parts.push(`<text x="${origin.x - 14}" y="${origin.y + CM_NUMBER_SIZE * 0.35}" font-size="${CM_NUMBER_SIZE}" font-family="Liberation Sans, Arial, sans-serif" fill="${dark}" text-anchor="end">0</text>`);
  parts.push(`<text x="${origin.x - 14}" y="${origin.y + CM_NUMBER_SIZE * 0.35 + Math.round(CM_NUMBER_SIZE * 0.85)}" font-size="${Math.round(CM_NUMBER_SIZE * 0.65)}" font-family="Liberation Sans, Arial, sans-serif" fill="${dark}" text-anchor="end">Cm</text>`);

  // The product sits FLUSH against both ruler baselines (left edge exactly
  // on the vertical axis, bottom edge exactly on the horizontal axis) — so
  // its zero edges are exactly at zero by construction, with no gap to
  // measure or misalign, and its far edges (top/right) land at their exact
  // declared value on the axis they touch. The height guide then traces
  // across from the product's RIGHT edge (not its left/top — the product
  // itself occupies that space) across to the right-hand callout, framing
  // the measured region like the approved reference without ever crossing
  // over the jewellery, and without any gap-bridging arithmetic that could
  // drift out of alignment with the ticks.
  const labelX = CANVAS_SIZE - RIGHT_MARGIN + 98;
  if (measuredTopY != null && measuredRightX != null) {
    parts.push(`<line x1="${measuredRightX}" y1="${measuredTopY}" x2="${labelX - 14}" y2="${measuredTopY}" stroke="${dark}" stroke-width="${GUIDE_STROKE}" ${dash} />`);
  }
  if (measuredRightX != null && measuredTopY != null && measuredBottomY != null) {
    parts.push(`<line x1="${measuredRightX}" y1="${measuredBottomY}" x2="${measuredRightX}" y2="${measuredTopY}" stroke="${dark}" stroke-width="${GUIDE_STROKE}" ${dash} />`);
  }

  // Horizontal double-headed width arrow + label, BELOW the ruler's own
  // cm numbers (never over the jewellery, which occupies the space directly
  // above the axis) — spans exactly the product's measured width, matching
  // the approved reference's "8 mm" arrow.
  if (measuredRightX != null && measuredWidthValue != null) {
    const widthArrowY = origin.y + CM_TICK_LEN + CM_NUMBER_SIZE + 64;
    parts.push(`<line x1="${origin.x}" y1="${widthArrowY}" x2="${measuredRightX}" y2="${widthArrowY}" stroke="${dark}" stroke-width="${ARROW_STROKE}" />`);
    parts.push(`<path d="M ${origin.x} ${widthArrowY} l 18 -10 l 0 20 z" fill="${dark}" />`);
    parts.push(`<path d="M ${measuredRightX} ${widthArrowY} l -18 -10 l 0 20 z" fill="${dark}" />`);
    parts.push(
      `<text x="${(origin.x + measuredRightX) / 2}" y="${widthArrowY + NOTE_SIZE + 10}" font-size="${NOTE_SIZE}" font-weight="600" font-family="Liberation Sans, Arial, sans-serif" fill="${dark}" text-anchor="middle">${measuredWidthValue} ${escapeXml(unit)}</text>`,
    );
  }

  // Double-headed height arrow + label in the right-hand callout column —
  // matches the approved mockup's layout, now anchored to the actual
  // measured top/bottom (product bottom = ruler zero, top = declared
  // height) rather than a centred placement.
  const arrowX = CANVAS_SIZE - RIGHT_MARGIN + 70;
  if (measuredTopY != null && measuredBottomY != null) {
    parts.push(`<line x1="${arrowX}" y1="${measuredTopY}" x2="${arrowX}" y2="${measuredBottomY}" stroke="${dark}" stroke-width="${ARROW_STROKE}" />`);
    parts.push(`<path d="M ${arrowX} ${measuredTopY} l -10 18 l 20 0 z" fill="${dark}" />`);
    parts.push(`<path d="M ${arrowX} ${measuredBottomY} l -10 -18 l 20 0 z" fill="${dark}" />`);

    const labelMidY = (measuredTopY + measuredBottomY) / 2;
    parts.push(
      `<text x="${labelX}" y="${labelMidY - 10}" font-size="${DIM_VALUE_SIZE}" font-weight="700" font-family="Liberation Sans, Arial, sans-serif" fill="${dark}">${escapeXml(categoryTitleFor(jewelleryType))}</text>`,
    );
    if (measuredHeightValue != null) {
      const cmValue = Math.round((measuredHeightValue / 10) * 100) / 100;
      parts.push(
        `<text x="${labelX}" y="${labelMidY + 26}" font-size="${DIM_VALUE_SIZE}" font-family="Liberation Sans, Arial, sans-serif" fill="${dark}">${measuredHeightValue} ${escapeXml(unit)} = ${cmValue} cm</text>`,
      );
    }
  }

  // Included/excluded-part callout (loop/hook/clasp) — a solid arrow from
  // the text label pointing at the approximate part location, matching the
  // approved reference's style (not a dashed pointer). The location is
  // measurement-data-driven arithmetic (proportion of the declared
  // part/whole heights against the placed product box), not a visually
  // detected boundary — see INCLUSION_RULES' own comment.
  if (loopCallout) {
    const { targetX, targetY, text } = loopCallout;
    const calloutLabelY = Math.max(TOP_MARGIN + 20, targetY - 60);
    const lineStartX = labelX - 6;
    const lineStartY = calloutLabelY + 6;
    const angle = Math.atan2(targetY - lineStartY, targetX - lineStartX);
    const headLen = 16;
    const backX = targetX - headLen * Math.cos(angle - Math.PI / 7);
    const backY = targetY - headLen * Math.sin(angle - Math.PI / 7);
    const back2X = targetX - headLen * Math.cos(angle + Math.PI / 7);
    const back2Y = targetY - headLen * Math.sin(angle + Math.PI / 7);
    parts.push(`<line x1="${lineStartX}" y1="${lineStartY}" x2="${targetX}" y2="${targetY}" stroke="${dark}" stroke-width="${MM5_TICK_STROKE}" />`);
    parts.push(`<path d="M ${targetX} ${targetY} L ${backX} ${backY} L ${back2X} ${back2Y} Z" fill="${dark}" />`);
    parts.push(
      `<text x="${labelX}" y="${calloutLabelY}" font-size="${NOTE_SIZE}" font-family="Liberation Sans, Arial, sans-serif" fill="${dark}">${escapeXml(text)}</text>`,
    );
  }

  // Top-left infobox — category title, full dimension summary (plan's
  // "MEASUREMENT TEXT" section examples), kept alongside the on-image
  // callouts above for accessibility (screen readers / alt text sources).
  const dims = primaryDimensionsFor(jewelleryType, measurements);
  const dimParts = [];
  if (dims.widthValue != null) dimParts.push(`${dims.widthValue} ${unit}`);
  if (dims.heightValue != null) dimParts.push(`${dims.heightValue} ${unit}`);
  const dimText = dimParts.join(' × ');

  parts.push(`<text x="${LEFT_MARGIN}" y="56" font-size="${HEADING_SIZE}" font-weight="600" font-family="Liberation Sans, Arial, sans-serif" fill="${dark}">${escapeXml(categoryTitleFor(jewelleryType))}</text>`);
  if (dimText) {
    parts.push(`<text x="${LEFT_MARGIN}" y="96" font-size="${DIM_VALUE_SIZE}" font-family="Liberation Sans, Arial, sans-serif" fill="${dark}">${escapeXml(dimText)}</text>`);
  }
  if (inclusionNote) {
    parts.push(`<text x="${LEFT_MARGIN}" y="130" font-size="${NOTE_SIZE}" font-family="Liberation Sans, Arial, sans-serif" fill="${dark}">${escapeXml(inclusionNote)}</text>`);
  }

  return `<svg width="${CANVAS_SIZE}" height="${CANVAS_SIZE}" viewBox="0 0 ${CANVAS_SIZE} ${CANVAS_SIZE}" xmlns="http://www.w3.org/2000/svg">${parts.join('')}</svg>`;
}

// The fixed-canvas renderer (plan point 4's numbered process): crop tightly
// to the detected product, resize it by ONE uniform factor (never stretched
// independently per axis), place it FLUSH against the ruler's zero origin
// (touching both baselines, so its edges land exactly on their ruler
// values with no gap arithmetic to drift), derive one shared px-per-mm
// scale from the ruler's own dynamic per-axis range, then draw the ruler
// overlay and composite everything onto a clean white canvas.
export async function composeMeasurementImage({ productBuffer, boundingBox, jewelleryType, unit, measurements, includedParts, excludedParts }) {
  const cropped = sharp(productBuffer).extract({
    left: boundingBox.left,
    top: boundingBox.top,
    width: boundingBox.width,
    height: boundingBox.height,
  });
  const croppedMeta = await cropped.metadata();
  const croppedWidth = croppedMeta.width;
  const croppedHeight = croppedMeta.height;

  const { widthValue, heightValue } = primaryDimensionsFor(jewelleryType, measurements);
  const declaredWidthMm = widthValue != null ? toMm(widthValue, unit) : null;
  const declaredHeightMm = heightValue != null ? toMm(heightValue, unit) : null;

  // Dynamic per-axis ruler range — "maximumScaleCm = ceil(measurementInMm /
  // 10)" on each axis independently (a 10x15.5mm piece gets a 0–1cm
  // horizontal ruler and a 0–2cm vertical ruler, not one shared 0–3cm
  // range). A missing axis (e.g. a Bangle's single outer-diameter value)
  // mirrors whichever axis IS declared, purely to keep the L-shape's
  // vertical guide visually present — no arrow/value is drawn on it.
  const rulerLengthMmX = rulerLengthMmFor(declaredWidthMm) ?? rulerLengthMmFor(declaredHeightMm) ?? 10;
  const rulerLengthMmY = rulerLengthMmFor(declaredHeightMm) ?? rulerLengthMmX;

  const photoArea = {
    x: LEFT_MARGIN,
    y: TOP_MARGIN,
    width: CANVAS_SIZE - LEFT_MARGIN - RIGHT_MARGIN,
    height: CANVAS_SIZE - TOP_MARGIN - BOTTOM_MARGIN,
  };
  // One shared px-per-mm scale (a real ruler reads the same both
  // directions) sized so BOTH axes' full ruler length fits inside the
  // available area — whichever axis is more space-constrained determines
  // the scale for both.
  const pxPerMm = Math.min(photoArea.width / rulerLengthMmX, photoArea.height / rulerLengthMmY);

  // The product's displayed pixel size is DERIVED from that scale applied to
  // the declared values directly (the admin's declared numbers are trusted
  // as-is — see composeMeasurementImage's resize call below). When only one
  // primary dimension is declared (e.g. a Bangle's outer diameter alone),
  // the other axis falls back to the cropped photo's own aspect ratio, since
  // there's no declared value to size it from.
  const resizedWidth = declaredWidthMm
    ? Math.round(declaredWidthMm * pxPerMm)
    : Math.round(croppedWidth * ((declaredHeightMm * pxPerMm) / croppedHeight));
  const resizedHeight = declaredHeightMm
    ? Math.round(declaredHeightMm * pxPerMm)
    : Math.round(croppedHeight * ((declaredWidthMm * pxPerMm) / croppedWidth));

  const origin = { x: photoArea.x, y: photoArea.y + photoArea.height };

  // Anchor the product FLUSH against both ruler baselines — left edge
  // exactly on the vertical axis, bottom edge exactly on the horizontal
  // axis — so the measured product body starts exactly at zero on both
  // rulers by construction (touching, like an object laid directly against
  // a tape measure), never floating centred inside an unrelated frame, and
  // never needing a gap-bridging guide line that could drift out of exact
  // alignment with the ticks.
  const placedBox = {
    left: origin.x,
    top: Math.round(origin.y - resizedHeight),
    width: resizedWidth,
    height: resizedHeight,
  };

  // Measured span for the right-hand callout arrow, and the included/
  // excluded-part pointer — see buildRulerOverlaySvg's own comments. No
  // category currently has a part-vs-whole pair to divide proportionally
  // for an exact boundary (INCLUSION_RULES no longer defines one for any
  // category — see its own comment); every category with an inclusion rule
  // gets an approximate top-of-piece pointer instead — there is no admin-
  // entered part measurement to place it precisely (INCLUSION_RULES'
  // comment documents this is arithmetic on declared numbers, never a
  // visually detected edge).
  const inclusionRule = INCLUSION_RULES[jewelleryType];
  let inclusionNote = null;
  let measuredTopY = placedBox.top;
  let measuredBottomY = placedBox.top + placedBox.height;
  let measuredHeightValue = heightValue;
  let loopCallout = null;

  if (inclusionRule) {
    const isExcluded = (excludedParts ?? []).includes(inclusionRule.part);
    const isIncluded = (includedParts ?? []).includes(inclusionRule.part);
    if (isExcluded) {
      inclusionNote = `${inclusionRule.label} excluded`;
      let calloutTopY = placedBox.top + placedBox.height * 0.08;
      if (inclusionRule.partHeightKey && inclusionRule.wholeHeightKey) {
        const partValue = measurements[inclusionRule.partHeightKey];
        const wholeValue = measurements[inclusionRule.wholeHeightKey];
        if (partValue != null && wholeValue != null) {
          const ratio = partValue / wholeValue;
          measuredTopY = placedBox.top + placedBox.height * (1 - ratio);
          measuredHeightValue = partValue;
          calloutTopY = (placedBox.top + measuredTopY) / 2;
        }
      }
      loopCallout = {
        targetX: placedBox.left + placedBox.width * 0.5,
        targetY: calloutTopY,
        text: inclusionNote,
      };
    } else if (isIncluded) {
      inclusionNote = `${inclusionRule.label} included`;
      loopCallout = {
        targetX: placedBox.left + placedBox.width * 0.5,
        targetY: placedBox.top + placedBox.height * 0.08,
        text: inclusionNote,
      };
    }
  }

  const overlaySvg = buildRulerOverlaySvg({
    jewelleryType,
    unit,
    measurements,
    pxPerMm,
    origin,
    rulerLengthMmX,
    rulerLengthMmY,
    inclusionNote,
    measuredTopY: measuredHeightValue != null ? measuredTopY : null,
    measuredBottomY: measuredHeightValue != null ? measuredBottomY : null,
    measuredHeightValue,
    measuredRightX: declaredWidthMm != null ? placedBox.left + placedBox.width : null,
    measuredWidthValue: widthValue,
    loopCallout,
  });
  const overlayBuffer = await sharp(Buffer.from(overlaySvg)).png().toBuffer();
  // fit: 'fill' — NOT the sharp default ('cover'). 'cover' would crop the
  // product whenever the declared width/height box's aspect ratio differs
  // from the actual photographed product's (now common since there's no
  // longer an aspect-ratio check rejecting that mismatch — see
  // primaryDimensionsFor's comment). Stretching instead of cropping keeps
  // the whole product visible; the admin's declared numbers are trusted
  // as-is, so nothing about the photographed piece should be clipped away
  // to force it into their numbers.
  const resizedProductBuffer = await cropped.resize(resizedWidth, resizedHeight, { fit: 'fill' }).png().toBuffer();

  const finalBuffer = await sharp({
    create: { width: CANVAS_SIZE, height: CANVAS_SIZE, channels: 3, background: { r: 255, g: 255, b: 255 } },
  })
    .composite([
      { input: resizedProductBuffer, left: placedBox.left, top: placedBox.top },
      { input: overlayBuffer, left: 0, top: 0 },
    ])
    .png()
    .toBuffer();

  return finalBuffer;
}

// Reference photo resolution: prefer the most recent AI Studio job's own
// primary reference image (any status — a job doesn't need to have
// succeeded or even be finished for its uploaded reference photo to still
// be a valid, high-quality source), else fall back to the product's own
// manually-uploaded ORIGINAL photo. This is what lets a product with no AI
// Studio history at all still generate/regenerate a Product Size Image
// (plan point 2 — "reopen ANY existing product").
async function resolveReferenceImage(productId) {
  const { rows: jobRows } = await query(
    `SELECT reference_image_urls FROM ai_studio_jobs WHERE product_id = $1 ORDER BY created_at DESC LIMIT 1`,
    [productId],
  );
  const jobUrls = jobRows[0]?.reference_image_urls;
  if (Array.isArray(jobUrls) && jobUrls.length > 0) {
    return { url: jobUrls[0], mimetype: 'image/jpeg' };
  }

  const { rows: imageRows } = await query(
    `SELECT url, format FROM product_images WHERE product_id = $1 AND type = 'ORIGINAL'
     ORDER BY (format = 'jpeg') DESC, sort_order ASC LIMIT 1`,
    [productId],
  );
  if (imageRows[0]) {
    const mimetype = imageRows[0].format === 'jpeg' ? 'image/jpeg' : `image/${imageRows[0].format}`;
    return { url: imageRows[0].url, mimetype };
  }
  return null;
}

// The full orchestration for one generation attempt — called by
// productSizeImageJob.js. Never throws for an expected/handleable failure;
// returns {status:'failed', failureReason} instead, so the job handler can
// record it without a try/catch around every step.
export async function runProductSizeGeneration(productId, measurementsRow) {
  const reference = await resolveReferenceImage(productId);
  if (!reference) {
    return { status: 'failed', failureReason: 'No product photo is available to generate from.' };
  }
  const referenceBuffer = await storageProvider.read(keyFromUrl(reference.url));

  const baseBuffer = await generateProductSizeBase(referenceBuffer, reference.mimetype);

  const baseValidation = await validateProductSizeBase({
    generatedBuffer: baseBuffer,
    referenceBuffer,
    referenceMimetype: reference.mimetype,
  });
  if (baseValidation.status === 'failed') {
    return { status: 'failed', failureReason: baseValidation.reasons.join(' ') || 'Product design differs from reference.' };
  }

  const boundingBox = await detectProductBoundingBox(baseBuffer);
  if (!boundingBox) {
    return { status: 'failed', failureReason: 'Background is not clean enough to detect product boundaries reliably.' };
  }

  // No cross-check against the declared measurements here by design — the
  // admin is expected to have physically measured the real piece, and the
  // ruler renders exactly what they entered regardless of how it compares
  // to the detected photo proportions (explicit product decision: never
  // reject a generation over a declared-vs-detected mismatch).
  const finalBuffer = await composeMeasurementImage({
    productBuffer: baseBuffer,
    boundingBox,
    jewelleryType: measurementsRow.jewellery_type,
    unit: measurementsRow.unit,
    measurements: measurementsRow.measurements,
    includedParts: measurementsRow.included_parts,
    excludedParts: measurementsRow.excluded_parts,
  });

  return { status: baseValidation.status, buffer: finalBuffer, failureReason: null };
}
