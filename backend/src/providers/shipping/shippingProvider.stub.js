import crypto from 'node:crypto';
import { env } from '../../config/env.js';

// Dev/test provider — no real courier. Same signPayload/verifySignature
// pattern as the payment provider stub, used by the admin "simulate
// tracking update" endpoint to exercise the real webhook verification +
// idempotency path without a real courier calling in.
export const stubShippingProvider = {
  name: 'stub',

  async createShipment() {
    return {
      providerShipmentId: `stub_ship_${crypto.randomUUID()}`,
      trackingNumber: `TRK${Date.now()}`,
      courierName: 'Stub Express',
      status: 'PENDING',
    };
  },

  async cancelShipment() {
    return { status: 'CANCELLED' };
  },

  signPayload(payload) {
    const body = JSON.stringify(payload);
    const signature = crypto.createHmac('sha256', env.shippingWebhookSecret).update(body).digest('hex');
    return { body, signature };
  },

  verifySignature(rawBody, signature) {
    if (!signature) return false;
    const expected = crypto.createHmac('sha256', env.shippingWebhookSecret).update(rawBody).digest('hex');
    const expectedBuf = Buffer.from(expected, 'hex');
    const signatureBuf = Buffer.from(signature, 'hex');
    if (expectedBuf.length !== signatureBuf.length) return false;
    return crypto.timingSafeEqual(expectedBuf, signatureBuf);
  },
};
