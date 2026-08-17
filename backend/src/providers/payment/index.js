import { stubPaymentProvider } from './paymentProvider.stub.js';
import { env } from '../../config/env.js';

const providers = { stub: stubPaymentProvider };

export const paymentProvider = providers[env.paymentProvider] ?? stubPaymentProvider;
