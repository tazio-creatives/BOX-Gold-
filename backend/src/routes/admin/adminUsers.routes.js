import { Router } from 'express';
import { requireRole } from '../../middleware/adminAuth.js';
import { list, roles, create, update } from '../../controllers/adminUsers.controller.js';

// Managing who else has admin access is the most sensitive admin surface in
// the app (plan §8 SEC) — restricted to SUPER_ADMIN regardless of what other
// roles get added later.
export const adminUsersRouter = Router();

adminUsersRouter.use(requireRole('SUPER_ADMIN'));
adminUsersRouter.get('/', list);
adminUsersRouter.get('/roles', roles);
adminUsersRouter.post('/', create);
adminUsersRouter.patch('/:id', update);
