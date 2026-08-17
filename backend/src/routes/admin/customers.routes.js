import { Router } from 'express';
import { list, get } from '../../controllers/adminCustomers.controller.js';

// Mounted at /api/v1/admin/customers.
export const adminCustomersRouter = Router();

adminCustomersRouter.get('/', list);
adminCustomersRouter.get('/:id', get);
