// Real provider — Delhivery. Credentials live only in backend env vars
// (DELHIVERY_API_TOKEN/DELHIVERY_BASE_URL/DELHIVERY_PICKUP_LOCATION).
//
// Request/response shapes below follow Delhivery's publicly documented
// Create Shipment / Pincode Serviceability / Track / Packing Slip / Cancel
// APIs. No live Delhivery account was available to verify against a real
// sandbox while building this — per the plan, this is built against the
// documented shapes now and should be smoke-tested against a real sandbox
// call (one pincode check + one shipment create) the first time real
// DELHIVERY_API_TOKEN/DELHIVERY_BASE_URL values are configured, before
// relying on it for real orders.
import { env } from '../../config/env.js';

function authHeaders(extra = {}) {
  return {
    Authorization: `Token ${env.delhiveryApiToken}`,
    ...extra,
  };
}

async function parseJsonResponse(response, label) {
  const text = await response.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`Delhivery ${label} returned a non-JSON response (${response.status}): ${text.slice(0, 300)}`);
  }
  if (!response.ok) {
    throw new Error(`Delhivery ${label} failed (${response.status}): ${text.slice(0, 300)}`);
  }
  return data;
}

export const delhiveryShippingProvider = {
  name: 'delhivery',

  // GET /c/api/pin-codes/json/?filter_codes=<pin> — prepaid orders need
  // postal_code.pre_paid === 'Y' at the destination pincode.
  async checkServiceability(pincode) {
    const response = await fetch(`${env.delhiveryBaseUrl}/c/api/pin-codes/json/?filter_codes=${pincode}`, {
      headers: authHeaders(),
    });
    const data = await parseJsonResponse(response, 'pincode serviceability check');
    const code = data.delivery_codes?.[0]?.postal_code;
    return { serviceable: !!code && code.pre_paid === 'Y', raw: data };
  },

  // POST /api/cmu/create.json — shipments[] + pickup_location, form-encoded
  // as format=json&data=<json>. Leaving "waybill" blank has Delhivery
  // auto-assign and return one in packages[0].waybill (no separate AWB
  // fetch call needed for the common case of one package per shipment).
  async createShipment({ order, items, packageDetails }) {
    const address = order.shipping_address;
    const productsDesc = items.map((i) => `${i.product_name} x${i.quantity}`).join(', ');
    const totalQuantity = items.reduce((sum, i) => sum + i.quantity, 0);

    const shipment = {
      name: address.name,
      add: [address.addressLine, address.building, address.landmark].filter(Boolean).join(', '),
      pin: address.pincode,
      city: address.city,
      state: address.state,
      country: 'India',
      phone: address.mobileNumber,
      order: order.order_number,
      payment_mode: 'Prepaid',
      products_desc: productsDesc,
      cod_amount: '0',
      total_amount: String(order.total_amount),
      quantity: String(totalQuantity),
      waybill: '',
      shipment_width: String(packageDetails.widthCm),
      shipment_height: String(packageDetails.heightCm),
      shipment_length: String(packageDetails.lengthCm),
      weight: String(packageDetails.weightGrams),
      shipping_mode: 'Surface',
      address_type: 'home',
    };

    const body = new URLSearchParams({
      format: 'json',
      data: JSON.stringify({
        shipments: [shipment],
        pickup_location: { name: env.delhiveryPickupLocation },
      }),
    });

    const response = await fetch(`${env.delhiveryBaseUrl}/api/cmu/create.json`, {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/x-www-form-urlencoded' }),
      body,
    });
    const data = await parseJsonResponse(response, 'shipment creation');
    const pkg = data.packages?.[0];
    if (!pkg || pkg.status !== 'Success' || !pkg.waybill) {
      const reason = pkg?.remarks?.join?.('; ') ?? data.rmk ?? 'unknown error';
      throw new Error(`Delhivery rejected shipment creation for order ${order.order_number}: ${reason}`);
    }

    return { waybill: pkg.waybill, courierName: 'Delhivery', labelUrl: null, raw: data };
  },

  // GET /api/p/packing_slip/?wbns=<waybill>&pdf=true — done as a follow-up
  // call rather than inline with createShipment so a transient failure here
  // never blocks the shipment (and order transition) from succeeding; the
  // admin UI can retry fetching the label independently.
  async fetchLabel(waybill) {
    const response = await fetch(`${env.delhiveryBaseUrl}/api/p/packing_slip/?wbns=${waybill}&pdf=true`, {
      headers: authHeaders(),
    });
    const data = await parseJsonResponse(response, 'label fetch');
    return { labelUrl: data.packages?.[0]?.pdf_download_link ?? null };
  },

  // POST /api/p/edit — { waybill, cancellation: "true" }. Confirmed live
  // against a real sandbox shipment: unlike every other endpoint here, this
  // one returns XML, not JSON — e.g.
  // <root><status>True</status><waybill>...</waybill><remark>Shipment has
  // been cancelled.</remark></root> — unrelated to the `format=json` param
  // createShipment sends, which this endpoint doesn't accept at all.
  async cancelShipment(waybill) {
    const response = await fetch(`${env.delhiveryBaseUrl}/api/p/edit`, {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ waybill, cancellation: 'true' }),
    });
    const text = await response.text();
    if (!response.ok) {
      throw new Error(`Delhivery shipment cancellation failed (${response.status}): ${text.slice(0, 300)}`);
    }

    const status = /<status>\s*true\s*<\/status>/i.test(text);
    const remark = text.match(/<remark>([\s\S]*?)<\/remark>/i)?.[1] ?? null;
    if (!status) {
      throw new Error(`Delhivery rejected cancellation of waybill ${waybill}: ${remark ?? text.slice(0, 300)}`);
    }
    return { status: 'CANCELLED', remark, raw: text };
  },

  // GET /api/v1/packages/json/?waybill=<waybill> — polled by the
  // shipment-tracking-sync job (no inbound webhook from Delhivery). Returns
  // Delhivery's own raw status string; the job maps it onto our
  // SHIPMENT_STATUSES vocabulary (see shippingService.js#DELHIVERY_STATUS_MAP)
  // and leaves anything it doesn't recognize alone rather than guessing.
  async trackShipment(waybill) {
    const response = await fetch(`${env.delhiveryBaseUrl}/api/v1/packages/json/?waybill=${waybill}`, {
      headers: authHeaders(),
    });
    const data = await parseJsonResponse(response, 'tracking fetch');
    const shipmentData = data.ShipmentData?.[0]?.Shipment;
    if (!shipmentData) return { status: null, raw: data };
    return {
      status: shipmentData.Status?.Status ?? null,
      statusType: shipmentData.Status?.StatusType ?? null,
      instructions: shipmentData.Status?.Instructions ?? null,
      raw: data,
    };
  },
};
