import { stubShippingProvider } from './shippingProvider.stub.js';
import { delhiveryShippingProvider } from './shippingProvider.delhivery.js';
import { env } from '../../config/env.js';

export const shippingProviders = { stub: stubShippingProvider, delhivery: delhiveryShippingProvider };

// The active provider (SHIPPING_PROVIDER) — used everywhere a new shipment
// is being created. The tracking-sync job looks a shipment's provider up in
// shippingProviders directly instead, so a shipment created under one
// provider keeps being polled correctly even if SHIPPING_PROVIDER is later
// switched.
export const shippingProvider = shippingProviders[env.shippingProvider] ?? stubShippingProvider;
