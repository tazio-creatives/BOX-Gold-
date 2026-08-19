import { env } from '../../config/env.js';
import { stubMetalRateProvider } from './metalRateProvider.stub.js';
import { goldapiMetalRateProvider } from './metalRateProvider.goldapi.js';

const providers = {
  stub: stubMetalRateProvider,
  goldapi: goldapiMetalRateProvider,
};

export const metalRateProvider = providers[env.metalRateProvider];

if (!metalRateProvider) {
  throw new Error(`Unknown METAL_RATE_PROVIDER "${env.metalRateProvider}"`);
}
