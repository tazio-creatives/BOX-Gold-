import { Router } from 'express';
import { list, create, update, createValue, updateValue } from '../../controllers/attributes.controller.js';

// Mounted at /api/v1/admin/attributes.
export const adminAttributesRouter = Router();

adminAttributesRouter.get('/', list);
adminAttributesRouter.post('/', create);
adminAttributesRouter.patch('/:id', update);
adminAttributesRouter.post('/:id/values', createValue);
adminAttributesRouter.patch('/values/:valueId', updateValue);
