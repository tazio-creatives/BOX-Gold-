import { formatPriceForEmail } from '../utils/formatPriceForEmail.js';

// Plain-text templates (plan §12: minimal stack, no templating engine) —
// each entry maps a template name to a render function returning
// {subject, body}. Payload shapes are documented per template since they're
// the only contract between the enqueue call site and the worker.
const templates = {
  // payload: { contactName, orderNumber, totalAmount }
  ORDER_CONFIRMED: ({ contactName, orderNumber, totalAmount }) => ({
    subject: `Your BOX DIAMONDS order ${orderNumber} is confirmed`,
    body: `Hi ${contactName},\n\nThank you for your order. Order ${orderNumber} for ${formatPriceForEmail(totalAmount)} has been confirmed and is being prepared.\n\nWe'll email you again once it ships.\n\n— BOX DIAMONDS`,
  }),

  // payload: { contactName, orderNumber }
  PAYMENT_FAILED: ({ contactName, orderNumber }) => ({
    subject: `Payment failed for order ${orderNumber}`,
    body: `Hi ${contactName},\n\nWe couldn't confirm payment for order ${orderNumber}. No amount has been charged and the order has not been placed. Please try again.\n\n— BOX DIAMONDS`,
  }),

  // payload: { contactName, orderNumber }
  ORDER_PROCESSING: ({ contactName, orderNumber }) => ({
    subject: `Order ${orderNumber} is being prepared`,
    body: `Hi ${contactName},\n\nYour order ${orderNumber} is now being prepared by our team.\n\nWe'll email you again once it's ready to ship.\n\n— BOX DIAMONDS`,
  }),

  // payload: { contactName, orderNumber }
  ORDER_READY_TO_SHIP: ({ contactName, orderNumber }) => ({
    subject: `Order ${orderNumber} is ready to ship`,
    body: `Hi ${contactName},\n\nYour order ${orderNumber} is packed and ready to ship. We'll email you again with tracking details once it's on its way.\n\n— BOX DIAMONDS`,
  }),

  // payload: { contactName, orderNumber, courierName, trackingNumber }
  ORDER_SHIPPED: ({ contactName, orderNumber, courierName, trackingNumber }) => ({
    subject: `Your order ${orderNumber} has shipped`,
    body: `Hi ${contactName},\n\nOrder ${orderNumber} is on its way via ${courierName}.${trackingNumber ? ` Tracking number: ${trackingNumber}.` : ''}\n\n— BOX DIAMONDS`,
  }),

  // payload: { contactName, orderNumber }
  ORDER_OUT_FOR_DELIVERY: ({ contactName, orderNumber }) => ({
    subject: `Order ${orderNumber} is out for delivery`,
    body: `Hi ${contactName},\n\nOrder ${orderNumber} is out for delivery and should arrive today.\n\n— BOX DIAMONDS`,
  }),

  // payload: { contactName, orderNumber }
  ORDER_DELIVERED: ({ contactName, orderNumber }) => ({
    subject: `Order ${orderNumber} has been delivered`,
    body: `Hi ${contactName},\n\nOrder ${orderNumber} has been delivered. We hope you love it — once you've had a chance to see it in person, we'd appreciate a review.\n\n— BOX DIAMONDS`,
  }),

  // payload: { contactName, orderNumber }
  ORDER_CANCELLED: ({ contactName, orderNumber }) => ({
    subject: `Order ${orderNumber} has been cancelled`,
    body: `Hi ${contactName},\n\nOrder ${orderNumber} has been cancelled. If a payment was made, it will be refunded to the original payment method.\n\n— BOX DIAMONDS`,
  }),

  // payload: { contactName, orderNumber }
  ORDER_DELIVERY_FAILED: ({ contactName, orderNumber }) => ({
    subject: `Delivery attempt failed for order ${orderNumber}`,
    body: `Hi ${contactName},\n\nWe attempted to deliver order ${orderNumber} but were unable to complete it. Our team will be in touch to arrange redelivery.\n\n— BOX DIAMONDS`,
  }),

  // payload: { contactName, orderNumber }
  ORDER_RETURN_INITIATED: ({ contactName, orderNumber }) => ({
    subject: `Return initiated for order ${orderNumber}`,
    body: `Hi ${contactName},\n\nA return has been initiated for order ${orderNumber}. We'll keep you updated as it makes its way back to us.\n\n— BOX DIAMONDS`,
  }),
};

export function renderEmailTemplate(template, payload) {
  const render = templates[template];
  if (!render) throw new Error(`Unknown email template "${template}"`);
  return render(payload ?? {});
}
