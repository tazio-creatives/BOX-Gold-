import { Router } from 'express';
import { list, get } from '../../controllers/adminOrders.controller.js';

// Mounted at /api/v1/admin/orders — every order, not scoped to one customer.
export const adminOrdersRouter = Router();

adminOrdersRouter.get('/', list);
adminOrdersRouter.get('/:id', get);
