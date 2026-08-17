import { simulateTrackingSchema } from '../validators/shipping.validators.js';
import * as shippingService from '../services/shippingService.js';
import { toShipmentDto } from '../utils/orderDto.js';

export async function ship(req, res, next) {
  try {
    const shipment = await shippingService.createShipmentForOrder(req.params.id);
    res.status(201).json({ shipment: toShipmentDto(shipment) });
  } catch (err) {
    next(err);
  }
}

export async function cancelShipment(req, res, next) {
  try {
    const shipment = await shippingService.cancelShipmentForOrder(req.params.id);
    res.json({ shipment: toShipmentDto(shipment) });
  } catch (err) {
    next(err);
  }
}

// Dev-only — see shippingService.simulateTrackingUpdate.
export async function simulateTracking(req, res, next) {
  try {
    const { status } = simulateTrackingSchema.parse(req.body);
    const result = await shippingService.simulateTrackingUpdate(req.params.id, status);
    res.json({ shipment: toShipmentDto(result.shipment), alreadyProcessed: result.alreadyProcessed });
  } catch (err) {
    next(err);
  }
}
