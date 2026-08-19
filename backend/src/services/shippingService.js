import { withTransaction } from '../config/db.js';
import { AppError, NotFoundError, ForbiddenError } from '../utils/AppError.js';
import { shippingProvider } from '../providers/shipping/index.js';
import {
  findShipmentByOrderId,
  insertShipment,
  findShipmentByProviderShipmentIdTx,
  updateShipmentStatusTx,
  updateShipmentStatusSimpleTx,
  insertShipmentTrackingEvent,
  insertShipmentTrackingEventTx,
} from '../repositories/shipments.repository.js';
import {
  findOrderById,
  updateOrderStatusTx,
  insertOrderStatusHistoryTx,
} from '../repositories/orders.repository.js';
import { enqueueEmail } from './emailService.js';

const SHIPPABLE_STATUSES = ['CONFIRMED', 'PROCESSING'];

// Admin action (plan §11b) — order reaches CONFIRMED/PROCESSING, admin
// triggers shipment creation, which is itself what moves the order to
// SHIPPED. No automatic trigger exists yet (plan left this "TBD when this
// phase is built"); admin-triggered matches how every other admin mutation
// in this codebase works, and there's no admin UI phase yet to wire an
// automatic hook into anyway.
export async function createShipmentForOrder(orderId) {
  const order = await findOrderById(orderId);
  if (!order) throw new NotFoundError('Order not found');
  if (!SHIPPABLE_STATUSES.includes(order.status)) {
    throw new AppError(400, `Cannot ship an order in status ${order.status}`);
  }

  const existing = await findShipmentByOrderId(orderId);
  if (existing) throw new AppError(400, 'A shipment already exists for this order');

  const result = await shippingProvider.createShipment(order);
  const shipment = await insertShipment({
    orderId,
    provider: shippingProvider.name,
    providerShipmentId: result.providerShipmentId,
    trackingNumber: result.trackingNumber,
    courierName: result.courierName,
    status: 'SHIPPED',
  });

  await withTransaction(async (client) => {
    await updateOrderStatusTx(client, orderId, 'SHIPPED');
    await insertOrderStatusHistoryTx(client, orderId, 'SHIPPED', `Shipped via ${shipment.courier_name ?? shipment.provider}`);
    await insertShipmentTrackingEventTx(client, {
      shipmentId: shipment.id,
      status: 'SHIPPED',
      note: `Shipment created via ${shipment.courier_name ?? shipment.provider}${shipment.tracking_number ? ` — tracking ${shipment.tracking_number}` : ''}`,
      source: 'SYSTEM',
    });
  });

  await enqueueEmail(order.contact_email, 'ORDER_SHIPPED', {
    contactName: order.contact_name,
    orderNumber: order.order_number,
    courierName: shipment.courier_name ?? shipment.provider,
    trackingNumber: shipment.tracking_number,
  });

  return shipment;
}

export async function cancelShipmentForOrder(orderId) {
  const shipment = await findShipmentByOrderId(orderId);
  if (!shipment) throw new NotFoundError('No shipment exists for this order');
  if (shipment.status === 'CANCELLED' || shipment.status === 'DELIVERED') {
    throw new AppError(400, `Cannot cancel a shipment that is already ${shipment.status}`);
  }

  await shippingProvider.cancelShipment(shipment.provider_shipment_id);

  await withTransaction(async (client) => {
    await updateShipmentStatusSimpleTx(client, shipment.id, 'CANCELLED');
    await updateOrderStatusTx(client, orderId, 'CANCELLED');
    await insertOrderStatusHistoryTx(client, orderId, 'CANCELLED', 'Shipment cancelled');
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

// Public courier webhook (plan §11b) — same signature-verification +
// idempotency discipline as the payment webhook. Idempotency here means "the
// incoming status matches what we already have," not a single terminal
// outcome, since shipping has a multi-step progression rather than one
// pass/fail result.
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

// Admin manually logging a tracking update while there's no real courier
// integration yet — a free-text history entry, independent of the
// shipment's own `status` field (which stays driven by ship/cancel/the
// simulate-tracking dev shortcut). Once a real provider is wired up, its
// webhook lands in confirmTrackingUpdate() above and appears in the same
// history list with source WEBHOOK instead of MANUAL — no schema change
// needed then.
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

// Dev-only stand-in for a real courier calling in (plan §11b stub scope) —
// mirrors paymentService.simulatePayment: builds a properly signed payload
// and runs it through the exact same confirmTrackingUpdate() the public
// webhook uses.
export async function simulateTrackingUpdate(orderId, status) {
  const shipment = await findShipmentByOrderId(orderId);
  if (!shipment) throw new NotFoundError('No shipment exists for this order');

  const { body, signature } = shippingProvider.signPayload({
    providerShipmentId: shipment.provider_shipment_id,
    status,
  });
  return confirmTrackingUpdate(body, signature);
}
