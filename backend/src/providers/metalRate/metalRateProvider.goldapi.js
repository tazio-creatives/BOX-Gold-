// Real provider — GoldAPI.io. Credentials live only in backend env vars.
import { env } from '../../config/env.js';

const GOLDAPI_BASE_URL = 'https://www.goldapi.io/api';
const SYMBOLS = { GOLD: 'XAU' };

export const goldapiMetalRateProvider = {
  async fetchRate(metal) {
    const symbol = SYMBOLS[metal];
    if (!symbol) {
      throw new Error(`goldapi metal rate provider does not support metal "${metal}"`);
    }

    const response = await fetch(`${GOLDAPI_BASE_URL}/${symbol}/INR`, {
      method: 'GET',
      headers: { 'x-access-token': env.goldapiAccessToken, Accept: 'application/json' },
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`GoldAPI rate fetch failed (${response.status}): ${body}`);
    }

    const data = await response.json();
    return { ratePerGram: data.price_gram_24k, source: 'goldapi' };
  },
};
