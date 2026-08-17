import crypto from 'node:crypto';

// Human-facing display id (plan §3 orders.order_number) — e.g. BD-260810-4F2A9C.
// Not the primary key; just needs to be unique and look intentional in an
// email/invoice. Collisions are astronomically unlikely at this volume, but
// the orders.order_number UNIQUE constraint is the real backstop.
export function generateOrderNumber() {
  const datePart = new Date().toISOString().slice(2, 10).replace(/-/g, '');
  const randomPart = crypto.randomBytes(4).toString('hex').toUpperCase();
  return `BD-${datePart}-${randomPart}`;
}
