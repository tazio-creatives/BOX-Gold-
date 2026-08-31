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
    trackingEvents: trackingEvents.map(toTrackingEventDto),
  };
}

// Shared response shape for checkout.controller.js (Phase 10) and
// orders.controller.js (Phase 12) — same order, same DTO either way.
export function toOrderDto(order, items = [], statusHistory = [], extra = {}) {
  return {
    id: order.id,
    orderNumber: order.order_number,
    status: order.status,
    contactName: order.contact_name,
    contactMobile: order.contact_mobile,
    contactEmail: order.contact_email,
    shippingAddress: order.shipping_address,
    deliveryNote: order.delivery_note,
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
      // for pre-cutover historical orders that never got a snapshot.
      const snapshot = item.variant_attributes_snapshot ?? [];
      const fromSnapshot = (code) => snapshot.find((s) => s.attributeCode === code)?.label ?? null;
      return {
        id: item.id,
        productId: item.product_id,
        productName: item.product_name,
        productSku: item.product_sku,
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
        isBackordered: item.is_backordered,
      };
    }),
    statusHistory: statusHistory.map((h) => ({
      status: h.status,
      note: h.note,
      createdAt: h.created_at,
    })),
    ...extra,
  };
}
