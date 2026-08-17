import { Router } from 'express';
import {
  list,
  createSection,
  updateSection,
  deleteSection,
  reorderSections,
  createItem,
  updateItem,
  deleteItem,
  reorderItems,
  uploadImage,
} from '../../controllers/adminHomepage.controller.js';
import { upload } from '../../middleware/upload.js';

// Mounted at /api/v1/admin/homepage (plan §5/§16).
export const adminHomepageRouter = Router();

adminHomepageRouter.get('/', list);
adminHomepageRouter.post('/upload-image', upload.single('image'), uploadImage);
adminHomepageRouter.post('/sections', createSection);
adminHomepageRouter.patch('/sections/reorder', reorderSections);
adminHomepageRouter.patch('/sections/:id', updateSection);
adminHomepageRouter.delete('/sections/:id', deleteSection);
adminHomepageRouter.post('/sections/:id/items', createItem);
adminHomepageRouter.patch('/sections/:id/items/reorder', reorderItems);
adminHomepageRouter.patch('/items/:id', updateItem);
adminHomepageRouter.delete('/items/:id', deleteItem);
