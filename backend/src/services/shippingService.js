import { withTransaction } from '../config/db.js';
import { AppError, NotFoundError, ForbiddenError } from '../utils/AppError.js';
import { shippingProvider, shippingProviders } from '../providers/shipping/index.js';
import {
  findShipmentByOrderId,
  insertShipment,
  updateShipmentLabelUrl,
  findShipmentByProviderShipmentIdTx,
  updateShipmentStatusTx,
  updateShipmentStatusSimpleTx,
  updateShipmentTrackingTx,
  touchShipmentTrackedAt,
  findShipmentsPendingTracking,
  insertShipmentTrackingEvent,
  insertShipmentTrackingEventTx,
} from '../repositories/shipments.repository.js';
import {
  findOrderById,
  findOrderItems,
  updateOrderStatusTx,
  updateOrderStatusFieldsTx,
  insertOrderStatusHistoryTx,
  hasOrderStatusHistoryEntry,
} from '../repositories/orders.repository.js';
import { enqueueEmail } from './emailService.js';

// Ready to Ship is only reachable from Processing (spec §7's transition
// table) — courier-controlled statuses beyond this point (Shipped, In
// Transit, Out for Delivery, Delivered) are driven by the tracking-sync job
// below, never set directly by an admin action.
export async function markOrderReadyToShip(orderId, packageDetails, actorAdminId) {
  const order = await findOrderById(orderId);
  if (!order) throw new NotFoundError('Order not found');
  if (order.order_status !== 'PROCESSING') {
    throw new AppError(400, `Order must be Processing to mark Ready to Ship (currently ${order.order_status ?? 'awaiting payment'})`);
  }

  const existing = await findShipmentByOrderId(orderId);
  if (existing) throw new AppError(400, 'A shipment already exists for this order');

  const serviceability = await shippingProvider.checkServiceability(order.shipping_address.pincode);
  if (!serviceability.serviceable) {
    throw new AppError(400, `Delivery pincode ${order.shipping_address.pincode} is not serviceable by the courier`);
  }

  const items = await findOrderItems(orderId);
  const result = await shippingProvider.createShipment({ order, items, packageDetails });

  const shipment = await insertShipment({
    orderId,
    provider: shippingProvider.name,
    providerShipmentId: result.waybill,
    trackingNumber: result.waybill,
    courierName: result.courierName,
    status: 'SHIPMENT_CREATED',
    packageWeightGrams: packageDetails.weightGrams,
    packageLengthCm: packageDetails.lengthCm,
    packageWidthCm: packageDetails.widthCm,
    packageHeightCm: packageDetails.heightCm,
    labelUrl: result.labelUrl ?? null,
  });

  const alreadyNotified = await hasOrderStatusHistoryEntry(orderId, 'READY_TO_SHIP');

  await withTransaction(async (client) => {
    // No legacy `status` write — READY_TO_SHIP has no legacy equivalent
    // (see ORDER_STATUS_TO_LEGACY_STATUS), same as the other new-only
    // statuses introduced in Phase 1.
    await updateOrderStatusFieldsTx(client, orderId, { orderStatus: 'READY_TO_SHIP', shipmentStatus: 'SHIPMENT_CREATED' });
    await insertOrderStatusHistoryTx(
      client,
      orderId,
      'READY_TO_SHIP',
      `Shipment created via ${shipment.courier_name} — AWB ${shipment.tracking_number}`,
      { actor: actorAdminId, source: 'ADMIN' },
    );
    await insertShipmentTrackingEventTx(client, {
      shipmentId: shipment.id,
      status: 'SHIPMENT_CREATED',
      note: `Shipment created via ${shipment.courier_name}${shipment.tracking_number ? ` — AWB ${shipment.tracking_number}` : ''}`,
      source: 'SYSTEM',
    });
  });

  if (!alreadyNotified) {
    await enqueueEmail(order.contact_email, 'ORDER_READY_TO_SHIP', {
      contactName: order.contact_name,
      orderNumber: order.order_number,
      courierName: shipment.courier_name,
      trackingNumber: shipment.tracking_number,
    });
  }

  // Best-effort — a label that isn't ready yet shouldn't block Ready to
  // Ship from succeeding; the admin UI's "Download Label" simply stays
  // absent until a later tracking sync (or a manual retry) fetches it.
  if (!shipment.label_url && typeof shippingProvider.fetchLabel === 'function') {
    try {
      const { labelUrl } = await shippingProvider.fetchLabel(shipment.tracking_number);
      if (labelUrl) {
        shipment.label_url = labelUrl;
        await updateShipmentLabelUrl(shipment.id, labelUrl);
      }
    } catch (err) {
      console.error(`[delhivery] label fetch failed for order ${order.order_number}:`, err.message);
    }
  }

  return shipment;
}

export async function cancelShipmentForOrder(orderId, actorAdminId) {
  const shipment = await findShipmentByOrderId(orderId);
  if (!shipment) throw new NotFoundError('No shipment exists for this order');
  if (shipment.status === 'CANCELLED' || shipment.status === 'DELIVERED') {
    throw new AppError(400, `Cannot cancel a shipment that is already ${shipment.status}`);
  }

  const provider = shippingProviders[shipment.provider] ?? shippingProvider;
  await provider.cancelShipment(shipment.provider_shipment_id);

  await withTransaction(async (client) => {
    await updateShipmentStatusSimpleTx(client, shipment.id, 'CANCELLED');
    await updateOrderStatusTx(client, orderId, 'CANCELLED');
    await updateOrderStatusFieldsTx(client, orderId, { orderStatus: 'CANCELLED', shipmentStatus: 'CANCELLED' });
    await insertOrderStatusHistoryTx(client, orderId, 'CANCELLED', 'Shipment cancelled', {
      actor: actorAdminId,
      source: 'ADMIN',
    });
    await insertShipmentTrackingEventTx(client, {
      shipmentId: shipment.id,
      status: 'CANCELLED',
      source: 'SYSTEM',
    });
  });

  const order = await findOrderById(orderId);
  await enqueueEmail(order.contact_email, 'ORDER_CANCELLED', {
    contactName: order.contact_name,
    orderNumber: order.order_number,
  });

  return findShipmentByOrderId(orderId);
}

const TRACKING_TO_ORDER_STATUS = {
  OUT_FOR_DELIVERY: 'OUT_FOR_DELIVERY',
  DELIVERED: 'DELIVERED',
};

// Public courier webhook — kept for the stub provider's dev "simulate
// tracking" shortcut below. Delhivery itself doesn't call this: it has no
// outbound webhook, only a pull API, which is why the real sync path is
// syncAllShipmentTracking() further down, not this function.
export async function confirmTrackingUpdate(rawBody, signature) {
  if (!shippingProvider.verifySignature(rawBody, signature)) {
    throw new ForbiddenError('Invalid webhook signature');
  }

  const payload = JSON.parse(rawBody);
  const { providerShipmentId, status } = payload;
  if (!providerShipmentId || !TRACKING_TO_ORDER_STATUS[status]) {
    throw new AppError(400, 'Malformed webhook payload');
  }

  const result = await withTransaction(async (client) => {
    const shipment = await findShipmentByProviderShipmentIdTx(client, providerShipmentId);
    if (!shipment) throw new NotFoundError('Unknown shipment reference');

    if (shipment.status === status) {
      return { alreadyProcessed: true, shipment };
    }

    const updated = await updateShipmentStatusTx(client, shipment.id, status, payload);
    await updateOrderStatusTx(client, shipment.order_id, TRACKING_TO_ORDER_STATUS[status]);
    await updateOrderStatusFieldsTx(client, shipment.order_id, {
      orderStatus: TRACKING_TO_ORDER_STATUS[status],
      shipmentStatus: status,
    });
    await insertOrderStatusHistoryTx(
      client,
      shipment.order_id,
      TRACKING_TO_ORDER_STATUS[status],
      `Courier update: ${status}`,
    );
    await insertShipmentTrackingEventTx(client, {
      shipmentId: shipment.id,
      status,
      source: 'WEBHOOK',
    });

    return { alreadyProcessed: false, shipment: updated };
  });

  if (!result.alreadyProcessed) {
    const order = await findOrderById(result.shipment.order_id);
    const template = status === 'DELIVERED' ? 'ORDER_DELIVERED' : 'ORDER_OUT_FOR_DELIVERY';
    await enqueueEmail(order.contact_email, template, {
      contactName: order.contact_name,
      orderNumber: order.order_number,
    });
  }

  return result;
}

// Admin manually logging a tracking update — a free-text history entry,
// independent of the shipment's own `status` field.
export async function addManualTrackingEvent(orderId, { status, location, note }) {
  const shipment = await findShipmentByOrderId(orderId);
  if (!shipment) throw new NotFoundError('No shipment exists for this order');

  return insertShipmentTrackingEvent({
    shipmentId: shipment.id,
    status,
    location,
    note,
    source: 'MANUAL',
  });
}

// Dev-only stand-in for a real courier calling in — mirrors
// paymentService.simulatePayment: builds a properly signed payload and runs
// it through the exact same confirmTrackingUpdate() the public webhook
// uses. Stub-provider-only; meaningless against a real Delhivery shipment.
export async function simulateTrackingUpdate(orderId, status) {
  const shipment = await findShipmentByOrderId(orderId);
  if (!shipment) throw new NotFoundError('No shipment exists for this order');

  const { body, signature } = shippingProvider.signPayload({
    providerShipmentId: shipment.provider_shipment_id,
    status,
  });
  return confirmTrackingUpdate(body, signature);
}

// Delhivery's own tracking status strings, mapped onto our SHIPMENT_STATUSES
// vocabulary (utils/orderStatus.js). Deliberately conservative — an
// unrecognized status is left alone (raw payload still gets logged as a
// tracking event's note) rather than guessed at, per the plan's "do not
// guess undocumented endpoint details" caution.
const DELHIVERY_STATUS_MAP = {
  Manifested: 'SHIPMENT_CREATED',
  'Not Picked': 'SHIPMENT_CREATED',
  'Picked Up': 'PICKED_UP',
  Dispatched: 'IN_TRANSIT',
  'In Transit': 'IN_TRANSIT',
  Pending: 'IN_TRANSIT',
  'Reached Destination': 'REACHED_DESTINATION',
  'Out for Delivery': 'OUT_FOR_DELIVERY',
  Delivered: 'DELIVERED',
  Delayed: 'DELAYED',
  'Delivery Failed': 'DELIVERY_FAILED',
  Undelivered: 'DELIVERY_FAILED',
  RTO: 'RTO_INITIATED',
  DTO: 'RTO_INITIATED',
  'RTO Delivered': 'RETURNED',
  Cancelled: 'CANCELLED',
};

// shipment_status -> order_status (spec §5's mapping table) — several
// granular courier states collapse onto one customer-facing order status.
const SHIPMENT_TO_ORDER_STATUS = {
  SHIPMENT_CREATED: 'READY_TO_SHIP',
  PICKED_UP: 'SHIPPED',
  IN_TRANSIT: 'IN_TRANSIT',
  REACHED_DESTINATION: 'IN_TRANSIT',
  OUT_FOR_DELIVERY: 'OUT_FOR_DELIVERY',
  DELIVERED: 'DELIVERED',
  DELAYED: 'DELAYED',
  DELIVERY_FAILED: 'DELIVERY_FAILED',
  RTO_INITIATED: 'RETURN_INITIATED',
  RETURNED: 'RETURNED',
  CANCELLED: 'CANCELLED',
};

const NOTIFY_TEMPLATE_FOR_SHIPMENT_STATUS = {
  PICKED_UP: 'ORDER_SHIPPED',
  OUT_FOR_DELIVERY: 'ORDER_OUT_FOR_DELIVERY',
  DELIVERED: 'ORDER_DELIVERED',
  DELIVERY_FAILED: 'ORDER_DELIVERY_FAILED',
};

async function syncOneShipment(shipment) {
  const provider = shippingProviders[shipment.provider];
  if (!provider || typeof provider.trackShipment !== 'function' || !shipment.tracking_number) {
    return null;
  }

  const result = await provider.trackShipment(shipment.tracking_number, shipment.status);
  const mapped = result.status ? DELHIVERY_STATUS_MAP[result.status] : null;

  if (!mapped) {
    // Nothing we recognize changed — still record that we checked, so the
    // "least recently checked" poll ordering doesn't get stuck on one
    // shipment forever.
    await touchShipmentTrackedAt(shipment.id);
    return null;
  }
  if (mapped === shipment.status) {
    await touchShipmentTrackedAt(shipment.id);
    return null;
  }

  const orderStatus = SHIPMENT_TO_ORDER_STATUS[mapped];
  const alreadyNotified = await hasOrderStatusHistoryEntry(shipment.order_id, orderStatus);

  await withTransaction(async (client) => {
    await updateShipmentTrackingTx(client, shipment.id, mapped, result.raw);
    await updateOrderStatusFieldsTx(client, shipment.order_id, { orderStatus, shipmentStatus: mapped });
    await insertOrderStatusHistoryTx(client, shipment.order_id, orderStatus, `Courier update: ${result.status}`, {
      source: 'DELHIVERY',
    });
    await insertShipmentTrackingEventTx(client, {
      shipmentId: shipment.id,
      status: mapped,
      note: result.instructions ?? result.status,
      source: 'DELHIVERY',
    });
  });

  const template = NOTIFY_TEMPLATE_FOR_SHIPMENT_STATUS[mapped];
  if (template && !alreadyNotified) {
    const order = await findOrderById(shipment.order_id);
    await enqueueEmail(order.contact_email, template, {
      contactName: order.contact_name,
      orderNumber: order.order_number,
    });
  }

  return { shipmentId: shipment.id, orderId: shipment.order_id, from: shipment.status, to: mapped };
}

// Scheduled job entry point (jobs/shipmentTrackingSyncJob.js) — polls every
// shipment not yet in a terminal state. One shipment's failure (a timeout,
// a malformed response) is logged and skipped rather than aborting the
// whole batch.
export async function syncAllShipmentTracking() {
  const shipments = await findShipmentsPendingTracking();
  const results = [];
  for (const shipment of shipments) {
    try {
      const result = await syncOneShipment(shipment);
      if (result) results.push(result);
    } catch (err) {
      console.error(`[shipment-tracking-sync] shipment ${shipment.id} failed:`, err.message);
    }
  }
  return results;
}

// Admin "Refresh Tracking" button — syncs just the one order's shipment on
// demand instead of waiting for the next scheduled run.
export async function syncOneShipmentTrackingForOrder(orderId) {
  const shipment = await findShipmentByOrderId(orderId);
  if (!shipment) throw new NotFoundError('No shipment exists for this order');
  await syncOneShipment(shipment);
  return findShipmentByOrderId(orderId);
}

// Admin "Fetch Label" / "Refresh Label" button — markOrderReadyToShip
// already tries this once automatically right after shipment creation, but
// a transient failure there (label genuinely not ready yet on Delhivery's
// side, a timeout) previously had no retry path from the UI. Always
// re-fetches rather than short-circuiting when a URL already exists, so it
// doubles as "get the latest label" if Delhivery ever regenerates one.
export async function fetchShipmentLabel(orderId) {
  const shipment = await findShipmentByOrderId(orderId);
  if (!shipment) throw new NotFoundError('No shipment exists for this order');

  const provider = shippingProviders[shipment.provider];
  if (!provider || typeof provider.fetchLabel !== 'function' || !shipment.tracking_number) {
    throw new AppError(400, `${shipment.provider} does not support label download`);
  }

  const { labelUrl } = await provider.fetchLabel(shipment.tracking_number);
  if (!labelUrl) {
    throw new AppError(400, 'Courier has not generated a label for this shipment yet — try again shortly');
  }

  return updateShipmentLabelUrl(shipment.id, labelUrl);
}
