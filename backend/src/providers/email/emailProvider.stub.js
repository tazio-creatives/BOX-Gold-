import { isProduction } from '../../config/env.js';

// Dev/test provider — logs instead of sending a real email (plan §12).
// Swappable for SES/Postmark/etc. later via EMAIL_PROVIDER, same pattern as
// OTP/payment/shipping/AI-image providers.
export const stubEmailProvider = {
  async send({ to, subject, body }) {
    if (isProduction) {
      throw new Error('emailProvider.stub must not be used in production');
    }
    console.log(`[stub email] -> ${to} | ${subject}\n${body}\n`);
  },
};
