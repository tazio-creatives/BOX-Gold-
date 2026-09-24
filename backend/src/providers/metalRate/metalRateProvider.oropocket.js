// Primary metal-rate provider — OroPocket's public India gold/silver price
// endpoint. No API key required, but still only ever called from this
// backend (see goldRateService.js) — never exposed to the storefront.
//
// Response shape (verified live 2026-09-24):
//   { statusCode, data: { gold: { buy, sell, gst, currency, unit, change24h }, silver: {...}, timestamp } }
// `buy` is GST-EXCLUSIVE: `gst` is consistently ~3% of `buy` (India's gold
// GST rate), an informational add-on figure, not an amount already folded
// into `buy`/`sell`. We read `buy` as-is as the base 24K rate and never add
// `gst` — Goldbox already applies GST separately in the pricing engine, so
// adding it here would double-count it.
import { env } from '../../config/env.js';

const EXPECTED_UNIT = 'gram';
const EXPECTED_CURRENCY = 'INR';

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

export const oropocketMetalRateProvider = {
  async fetchRate(metal) {
    if (metal !== 'GOLD') {
      throw new Error(`oropocket metal rate provider does not support metal "${metal}"`);
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), env.metalRateFetchTimeoutMs);
    let response;
    try {
      response = await fetch(`${env.oropocketBaseUrl}/public/prices`, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      });
    } catch (err) {
      if (err.name === 'AbortError') {
        throw new Error(`OroPocket rate fetch timed out after ${env.metalRateFetchTimeoutMs}ms`);
      }
      throw new Error(`OroPocket rate fetch failed: ${err.message}`);
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`OroPocket rate fetch failed (${response.status}): ${body.slice(0, 500)}`);
    }

    let payload;
    try {
      payload = await response.json();
    } catch {
      throw new Error('OroPocket rate fetch returned malformed (non-JSON) response');
    }

    const gold = payload?.data?.gold;
    if (!gold || typeof gold !== 'object') {
      throw new Error('OroPocket response missing data.gold');
    }

    const { buy, currency, unit } = gold;
    if (!isFiniteNumber(buy) || buy <= 0) {
      throw new Error(`OroPocket gold.buy is not a valid positive rate: ${JSON.stringify(buy)}`);
    }
    if (currency && currency !== EXPECTED_CURRENCY) {
      throw new Error(`OroPocket gold.currency unexpected: expected ${EXPECTED_CURRENCY}, got "${currency}"`);
    }
    if (unit && unit !== EXPECTED_UNIT) {
      throw new Error(`OroPocket gold.unit unexpected: expected ${EXPECTED_UNIT}, got "${unit}"`);
    }
    const timestamp = payload?.data?.timestamp;
    if (timestamp != null && Number.isNaN(new Date(timestamp).getTime())) {
      throw new Error(`OroPocket response timestamp is invalid: ${JSON.stringify(timestamp)}`);
    }

    return { ratePerGram: buy, source: 'oropocket' };
  },
};
