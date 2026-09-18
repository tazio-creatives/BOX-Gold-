import { markReadyToShipSchema, simulateTrackingSchema, addTrackingEventSchema } from '../validators/shipping.validators.js';
import * as shippingService from '../services/shippingService.js';
import { toShipmentDto, toTrackingEventDto } from '../utils/orderDto.js';

export async function readyToShip(req, res, next) {
  try {
    const body = markReadyToShipSchema.parse(req.body);
    const shipment = await shippingService.markOrderReadyToShip(req.params.id, body, req.admin.id);
    res.status(201).json({ shipment: toShipmentDto(shipment) });
  } catch (err) {
    next(err);
  }
}

export async function cancelShipment(req, res, next) {
  try {
    const shipment = await shippingService.cancelShipmentForOrder(req.params.id, req.admin.id);
    res.json({ shipment: toShipmentDto(shipment) });
  } catch (err) {
    next(err);
  }
}

// On-demand refresh from the admin order page — syncs the one order's
// shipment against the courier immediately rather than waiting for the
// next scheduled tracking-sync run.
export async function syncTracking(req, res, next) {
  try {
    const shipment = await shippingService.syncOneShipmentTrackingForOrder(req.params.id);
    res.json({ shipment: toShipmentDto(shipment) });
  } catch (err) {
    next(err);
  }
}

// Retries fetching the courier's label/packing-slip PDF — covers the case
// where the automatic fetch right after shipment creation failed or the
// label wasn't ready yet.
export async function fetchLabel(req, res, next) {
  try {
    const shipment = await shippingService.fetchShipmentLabel(req.params.id);
    res.json({ shipment: toShipmentDto(shipment) });
  } catch (err) {
    next(err);
  }
}

// Dev-only — see shippingService.simulateTrackingUpdate. Meaningless
// against a real Delhivery shipment (SHIPPING_PROVIDER=delhivery); only
// exercises anything with the stub provider active.
export async function simulateTracking(req, res, next) {
  try {
    const { status } = simulateTrackingSchema.parse(req.body);
    const result = await shippingService.simulateTrackingUpdate(req.params.id, status);
    res.json({ shipment: toShipmentDto(result.shipment), alreadyProcessed: result.alreadyProcessed });
  } catch (err) {
    next(err);
  }
}

export async function addTrackingEvent(req, res, next) {
  try {
    const body = addTrackingEventSchema.parse(req.body);
    const event = await shippingService.addManualTrackingEvent(req.params.id, body);
    res.status(201).json({ event: toTrackingEventDto(event) });
  } catch (err) {
    next(err);
  }
}
