import { Router } from 'express';
import { list, get } from '../controllers/orders.controller.js';
import { requireCustomerAuth } from '../middleware/customerAuth.js';

// Mounted at /api/v1/orders — "My Orders" (plan §12), always the caller's
// own orders only (loadOwnedOrder checks user_id, never trusts the id alone).
export const ordersRouter = Router();

ordersRouter.use(requireCustomerAuth);
ordersRouter.get('/', list);
ordersRouter.get('/:id', get);
