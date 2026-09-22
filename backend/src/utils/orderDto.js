import { DEFAULT_TIMEZONE } from '../services/deliveryEstimateService.js';

// Reads the snapshot frozen onto the order at checkout (checkoutService.js)
// rather than recalculating — an order's estimate must never change based on
// when the order page happens to be viewed. Pre-cutover orders placed before
// this snapshot existed have null columns; the frontend's error-fallback
// copy ("Estimated delivery in 8-10 days") covers that case, same as it does
// for a malformed API response.
export function orderDeliveryEstimateDto(order) {
  if (!order.estimated_delivery_start_date || !order.estimated_delivery_end_date) return null;
  return {
    minimumDays: order.delivery_minimum_days,
    maximumDays: order.delivery_maximum_days,
    earliestDate: order.estimated_delivery_start_date,
    latestDate: order.estimated_delivery_end_date,
    timezone: DEFAULT_TIMEZONE,
  };
}

export function toTrackingEventDto(event) {
  return {
    id: event.id,
    status: event.status,
    location: event.location,
    note: event.note,
    source: event.source,
    createdAt: event.created_at,
  };
}

export function toShipmentDto(shipment, trackingEvents = []) {
  if (!shipment) return null;
  return {
    id: shipment.id,
    provider: shipment.provider,
    trackingNumber: shipment.tracking_number,
    courierName: shipment.courier_name,
    status: shipment.status,
    packageWeightGrams: nullableNumber(shipment.package_weight_grams),
    packageLengthCm: nullableNumber(shipment.package_length_cm),
    packageWidthCm: nullableNumber(shipment.package_width_cm),
    packageHeightCm: nullableNumber(shipment.package_height_cm),
    lastTrackedAt: shipment.last_tracked_at ?? null,
    trackingEvents: trackingEvents.map(toTrackingEventDto),
  };
}

function nullableNumber(value) {
  return value === null || value === undefined ? null : Number(value);
}

// Shared response shape for checkout.controller.js (Phase 10), orders.controller.js
// (customer) and adminOrders.controller.js (admin) — same order, same base fields
// either way. `forAdmin: true` adds the acting admin's name to each status-history
// entry (an "employee assignment" the spec says customers must never see) — pass
// findOrderStatusHistoryForAdmin()'s rows when forAdmin is true, or the plain
// findOrderStatusHistory() rows otherwise (the latter has no actor_name column, so
// forAdmin: true with the customer-facing rows would just show null names — always
// pair the two correctly at the call site).
export function toOrderDto(order, items = [], statusHistory = [], extra = {}, { forAdmin = false } = {}) {
  return {
    id: order.id,
    orderNumber: order.order_number,
    status: order.status,
    paymentStatus: order.payment_status,
    orderStatus: order.order_status,
    shipmentStatus: order.shipment_status,
    contactName: order.contact_name,
    contactMobile: order.contact_mobile,
    contactEmail: order.contact_email,
    shippingAddress: order.shipping_address,
    deliveryNote: order.delivery_note,
    deliveryEstimate: orderDeliveryEstimateDto(order),
    subtotal: Number(order.subtotal),
    discountAmount: Number(order.discount_amount),
    couponCode: order.coupon_code,
    gstAmount: Number(order.gst_amount),
    shippingAmount: Number(order.shipping_amount),
    totalAmount: Number(order.total_amount),
    createdAt: order.created_at,
    items: items.map((item) => {
      // variant_attributes_snapshot ([{attributeCode, label}]) is the
      // source of truth going forward — captured once at order placement,
      // attribute-count-agnostic. The old flat columns (product_size_label/
      // gold_color/purity/diamond_config_name) are read as a fallback only
      // for pre-cutover historical orders that never got a snapshot. The
      // *_snapshot columns (added by the 20260918000000 migration) follow
      // the same convention for weight/diamond data: null on any order
      // placed before that migration, in which case diamondCount/Colour/
      // Clarity fall back to the live product join (same drift risk that
      // already existed for every order before this snapshot existed).
      const snapshot = item.variant_attributes_snapshot ?? [];
      const fromSnapshot = (code) => snapshot.find((s) => s.attributeCode === code)?.label ?? null;
      return {
        id: item.id,
        productId: item.product_id,
        productName: item.product_name,
        productSku: item.product_sku,
        categoryName: item.category_name ?? null,
        productImageUrl: item.product_image_url ?? null,
        productImageLargeUrl: item.product_image_large_url ?? item.product_image_url ?? null,
        quantity: item.quantity,
        goldValue: Number(item.gold_value),
        diamondValue: Number(item.diamond_value),
        makingCharge: Number(item.making_charge),
        gstAmount: Number(item.gst_amount),
        unitPrice: Number(item.unit_price),
        lineTotal: Number(item.line_total),
        sizeLabel: fromSnapshot('size') ?? item.product_size_label ?? null,
        goldColor: fromSnapshot('gold_color') ?? item.gold_color ?? null,
        purity: fromSnapshot('purity') ?? item.purity ?? null,
        diamondConfigName: fromSnapshot('diamond_quality') ?? item.diamond_config_name ?? null,
        goldWeightGrams: nullableNumber(item.gold_weight_grams_snapshot),
        diamondWeightCarats: nullableNumber(item.diamond_weight_carats_snapshot),
        diamondCount: nullableNumber(item.diamond_count_snapshot ?? item.diamond_count),
        diamondColour: item.diamond_colour_snapshot ?? item.diamond_colour ?? null,
        diamondClarity: item.diamond_clarity_snapshot ?? item.diamond_clarity ?? null,
        customizationNote: item.customization_note ?? null,
        isBackordered: item.is_backordered,
        // Admin "Product Details" panel only (mirrors the storefront PDP) —
        // always the live product join, see findOrderItems' comment.
        metalType: item.metal_type ?? null,
        netWeightGrams: nullableNumber(item.net_weight_grams),
        grossWeightGrams: nullableNumber(item.gross_weight_grams),
        diamondWeightGrams: nullableNumber(item.diamond_weight_grams),
        gemstone: item.gemstone ?? null,
      };
    }),
    statusHistory: statusHistory.map((h) => ({
      status: h.status,
      note: h.note,
      createdAt: h.created_at,
      ...(forAdmin ? { source: h.source, actorName: h.actor_name ?? null } : {}),
    })),
    ...extra,
  };
}
