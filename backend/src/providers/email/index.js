import { stubEmailProvider } from './emailProvider.stub.js';
import { env } from '../../config/env.js';

const providers = { stub: stubEmailProvider };

export const emailProvider = providers[env.emailProvider] ?? stubEmailProvider;
