import { Router } from 'express';
import {
  createShipment,
  cancelShipment,
  syncTracking,
  simulateTracking,
  addTrackingEvent,
} from '../../controllers/adminShipping.controller.js';

// Mounted at /api/v1/admin/shipping.
export const adminShippingRouter = Router();

adminShippingRouter.post('/orders/:id/create-shipment', createShipment);
adminShippingRouter.post('/orders/:id/cancel-shipment', cancelShipment);
adminShippingRouter.post('/orders/:id/sync-tracking', syncTracking);
adminShippingRouter.post('/orders/:id/simulate-tracking', simulateTracking);
adminShippingRouter.post('/orders/:id/tracking-events', addTrackingEvent);
