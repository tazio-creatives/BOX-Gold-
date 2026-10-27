import { Router } from 'express';
import { metaCatalog } from '../controllers/feeds.controller.js';

// Mounted at /api/v1/feeds — public product feeds for external catalogues
// (the storefront server also serves them at boxdiamonds.com/feeds/…).
export const feedsRouter = Router();

feedsRouter.get('/meta-catalog.xml', metaCatalog);
