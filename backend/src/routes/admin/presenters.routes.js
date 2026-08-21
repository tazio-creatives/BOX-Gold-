import { Router } from 'express';
import { list, getOne } from '../../controllers/presenters.controller.js';

// Mounted at /api/v1/admin/presenters. Read-only this round — presenters are
// seeded directly (backend/src/db/seeds/presenters.seed.js), no admin CRUD
// UI yet.
export const adminPresentersRouter = Router();

adminPresentersRouter.get('/', list);
adminPresentersRouter.get('/:id', getOne);
