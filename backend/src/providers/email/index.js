import { stubEmailProvider } from './emailProvider.stub.js';
import { sesEmailProvider } from './emailProvider.ses.js';
import { env } from '../../config/env.js';

const providers = { stub: stubEmailProvider, ses: sesEmailProvider };

export const emailProvider = providers[env.emailProvider] ?? stubEmailProvider;
