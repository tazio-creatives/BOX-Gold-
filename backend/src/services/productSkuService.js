import { query } from '../config/db.js';
import { AppError } from '../utils/AppError.js';

// Permanent product SKUs: BD-{TYPE}-{NUMBER} — e.g. BD-RNG-001024.
// TYPE comes from the product's jewellery type (never the website
// category); NUMBER from one global database sequence (product_sku_seq), so
// two products created at the same moment can never share a number, and a
// later type or category change never invalidates the code. A SKU is
// assigned once, by the server, when the product row is created — and never
// changes after that.

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
];

export const SKU_TYPE_CODES = {
  RING: 'RNG',
  EARRINGS: 'ERG',
  PENDANT: 'PND',
  BANGLE: 'BNG',
  NECKLACE: 'NCK',
  BRACELET: 'BRC',
  MANGALSUTRA: 'MGS',
  CHAIN: 'CHN',
  ANKLET: 'ANK',
  NOSE_PIN: 'NSP',
  BROOCH: 'BRH',
  OTHER: 'OTH',
};

// The generated namespace — reserved, so a hand-typed SKU can never take a
// code the sequence will hand out later.
export const PERMANENT_SKU_PATTERN = /^BD-[A-Z]{3}-\d{6,}$/;

export function formatSku(jewelleryType, number) {
  const code = SKU_TYPE_CODES[jewelleryType];
  if (!code) throw new AppError(400, `Unsupported jewellery type "${jewelleryType}"`);
  return `BD-${code}-${String(number).padStart(6, '0')}`;
}

// Runs on the caller's connection (inside the product-create transaction
// when there is one — see config/db.js's ambient query()).
export async function allocateSku(jewelleryType) {
  if (!SKU_TYPE_CODES[jewelleryType]) {
    throw new AppError(400, 'Select the jewellery type before saving — it decides the product code (SKU).');
  }
  const { rows } = await query("SELECT nextval('product_sku_seq') AS n");
  return formatSku(jewelleryType, rows[0].n);
}

// Create: a hand-entered SKU is kept as-is (business rule: intentional
// manual codes are preserved) unless it uses the reserved generated format;
// otherwise one is allocated.
export async function resolveSkuForCreate({ sku, jewelleryType }) {
  const manual = sku?.trim();
  if (manual) {
    if (PERMANENT_SKU_PATTERN.test(manual)) {
      throw new AppError(400, 'Codes in the BD-XXX-000000 format are assigned automatically — leave the SKU empty.');
    }
    return manual;
  }
  return allocateSku(jewelleryType);
}

// Update: SKUs are permanent — resending the current value is fine (the
// admin form does), anything else is refused.
export function assertSkuUnchanged(existingSku, requestedSku) {
  if (requestedSku === undefined || requestedSku === null) return;
  if (requestedSku.trim() !== existingSku) {
    throw new AppError(400, 'A product code (SKU) is permanent once assigned and cannot be changed.');
  }
}
