import { Router } from 'express';
import { enhance } from '../../controllers/imageEnhancement.controller.js';
import { uploadEnhanceImage } from '../../middleware/upload.js';

export const adminImageEnhancementRouter = Router();

adminImageEnhancementRouter.post('/', uploadEnhanceImage.single('image'), enhance);
