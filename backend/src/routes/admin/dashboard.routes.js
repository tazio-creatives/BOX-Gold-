import { Router } from 'express';
import { getStats } from '../../controllers/adminDashboard.controller.js';

// Mounted at /api/v1/admin/dashboard — aggregate metrics for the admin home screen.
export const adminDashboardRouter = Router();

adminDashboardRouter.get('/stats', getStats);
