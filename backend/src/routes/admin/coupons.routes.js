import { Router } from 'express';
import { list, get, create, update } from '../../controllers/adminCoupons.controller.js';

export const adminCouponsRouter = Router();

adminCouponsRouter.get('/', list);
adminCouponsRouter.get('/:id', get);
adminCouponsRouter.post('/', create);
adminCouponsRouter.patch('/:id', update);
