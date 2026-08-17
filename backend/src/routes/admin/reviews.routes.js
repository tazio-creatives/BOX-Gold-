import { Router } from 'express';
import { list, approve, reject } from '../../controllers/adminReviews.controller.js';

// Mounted at /api/v1/admin/reviews (plan §5 moderation queue).
export const adminReviewsRouter = Router();

adminReviewsRouter.get('/', list);
adminReviewsRouter.post('/:id/approve', approve);
adminReviewsRouter.post('/:id/reject', reject);
