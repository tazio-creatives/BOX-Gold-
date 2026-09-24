import { renderOrderStatusEmail, ORDER_STATUS_EMAIL_TEMPLATE_NAMES } from './emailTemplates/orderStatusEmail.js';

// Plain-text templates (plan §12: minimal stack, no templating engine) —
// each entry maps a template name to a render function returning
// {subject, body}. Payload shapes are documented per template since they're
// the only contract between the enqueue call site and the worker.
//
// The 6 customer order-lifecycle templates (ORDER_CONFIRMED through
// ORDER_DELIVERED) are NOT here — they're rendered by the shared HTML
// template in emailTemplates/orderStatusEmail.js instead (routed below in
// renderEmailTemplate). Everything else (payment/cancellation/return
// notices) stays plain text, unchanged.
const templates = {
  // payload: { contactName, orderNumber }
  PAYMENT_FAILED: ({ contactName, orderNumber }) => ({
    subject: `Payment failed for order ${orderNumber}`,
    body: `Hi ${contactName},\n\nWe couldn't confirm payment for order ${orderNumber}. No amount has been charged and the order has not been placed. Please try again.\n\n— BOX DIAMONDS`,
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

export async function renderEmailTemplate(template, payload) {
  if (ORDER_STATUS_EMAIL_TEMPLATE_NAMES.has(template)) {
    return renderOrderStatusEmail(template, payload ?? {});
  }
  const render = templates[template];
  if (!render) throw new Error(`Unknown email template "${template}"`);
  return render(payload ?? {});
}
