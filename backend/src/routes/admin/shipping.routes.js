import { Router } from 'express';
import { ship, cancelShipment, simulateTracking, addTrackingEvent } from '../../controllers/adminShipping.controller.js';

// Mounted at /api/v1/admin/shipping (plan §11b route list).
export const adminShippingRouter = Router();

adminShippingRouter.post('/orders/:id/ship', ship);
adminShippingRouter.post('/orders/:id/cancel-shipment', cancelShipment);
adminShippingRouter.post('/orders/:id/simulate-tracking', simulateTracking);
adminShippingRouter.post('/orders/:id/tracking-events', addTrackingEvent);
