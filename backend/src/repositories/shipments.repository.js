import { query } from '../config/db.js';

export async function findShipmentByOrderId(orderId) {
  const { rows } = await query(
    'SELECT * FROM shipments WHERE order_id = $1 ORDER BY created_at DESC LIMIT 1',
    [orderId],
  );
  return rows[0] ?? null;
}

export async function insertShipment({ orderId, provider, providerShipmentId, trackingNumber, courierName, status }) {
  const { rows } = await query(
    `INSERT INTO shipments (order_id, provider, provider_shipment_id, tracking_number, courier_name, status)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [orderId, provider, providerShipmentId, trackingNumber ?? null, courierName ?? null, status],
  );
  return rows[0];
}

// Locked for the duration of the webhook transaction — same reasoning as
// payments.repository.js's findPaymentByProviderRefTx (plan §11b idempotency).
export async function findShipmentByProviderShipmentIdTx(client, providerShipmentId) {
  const { rows } = await client.query(
    'SELECT * FROM shipments WHERE provider_shipment_id = $1 FOR UPDATE',
    [providerShipmentId],
  );
  return rows[0] ?? null;
}

export async function updateShipmentStatusTx(client, id, status, rawPayload) {
  const { rows } = await client.query(
    `UPDATE shipments SET status = $2, raw_webhook_payload = $3::jsonb, updated_at = now() WHERE id = $1 RETURNING *`,
    [id, status, JSON.stringify(rawPayload)],
  );
  return rows[0];
}

export async function updateShipmentStatusSimpleTx(client, id, status) {
  const { rows } = await client.query(
    `UPDATE shipments SET status = $2, updated_at = now() WHERE id = $1 RETURNING *`,
    [id, status],
  );
  return rows[0];
}

export async function insertShipmentTrackingEvent({ shipmentId, status, location, note, source = 'MANUAL' }) {
  const { rows } = await query(
    `INSERT INTO shipment_tracking_events (shipment_id, status, location, note, source)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [shipmentId, status, location ?? null, note ?? null, source],
  );
  return rows[0];
}

export async function insertShipmentTrackingEventTx(client, { shipmentId, status, location, note, source = 'MANUAL' }) {
  const { rows } = await client.query(
    `INSERT INTO shipment_tracking_events (shipment_id, status, location, note, source)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [shipmentId, status, location ?? null, note ?? null, source],
  );
  return rows[0];
}

export async function findTrackingEventsByShipmentId(shipmentId) {
  const { rows } = await query(
    'SELECT * FROM shipment_tracking_events WHERE shipment_id = $1 ORDER BY created_at DESC',
    [shipmentId],
  );
  return rows;
}
