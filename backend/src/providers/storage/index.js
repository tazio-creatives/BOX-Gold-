import { localStorageProvider } from './storageProvider.local.js';
import { env } from '../../config/env.js';

const providers = { local: localStorageProvider };

export const storageProvider = providers[env.storageProvider] ?? localStorageProvider;
