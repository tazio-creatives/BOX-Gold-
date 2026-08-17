export function toShipmentDto(shipment) {
  if (!shipment) return null;
  return {
    id: shipment.id,
    provider: shipment.provider,
    trackingNumber: shipment.tracking_number,
    courierName: shipment.courier_name,
    status: shipment.status,
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
    subtotal: Number(order.subtotal),
    discountAmount: Number(order.discount_amount),
    couponCode: order.coupon_code,
    gstAmount: Number(order.gst_amount),
    shippingAmount: Number(order.shipping_amount),
    totalAmount: Number(order.total_amount),
    createdAt: order.created_at,
    items: items.map((item) => ({
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
      sizeLabel: item.product_size_label ?? null,
      goldColor: item.gold_color ?? null,
      purity: item.purity ?? null,
      diamondConfigName: item.diamond_config_name ?? null,
    })),
    statusHistory: statusHistory.map((h) => ({
      status: h.status,
      note: h.note,
      createdAt: h.created_at,
    })),
    ...extra,
  };
}
