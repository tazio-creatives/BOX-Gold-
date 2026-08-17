import { stubShippingProvider } from './shippingProvider.stub.js';
import { env } from '../../config/env.js';

const providers = { stub: stubShippingProvider };

export const shippingProvider = providers[env.shippingProvider] ?? stubShippingProvider;
