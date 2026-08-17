import { env } from '../../config/env.js';
import { stubMetalRateProvider } from './metalRateProvider.stub.js';

const providers = {
  stub: stubMetalRateProvider,
  // A real provider (e.g. goldapi.io) plugs in here later — nothing else
  // in the codebase changes when it's swapped in (plan §9a).
};

export const metalRateProvider = providers[env.metalRateProvider];

if (!metalRateProvider) {
  throw new Error(`Unknown METAL_RATE_PROVIDER "${env.metalRateProvider}"`);
}
