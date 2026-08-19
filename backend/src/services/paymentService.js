import { withTransaction } from '../config/db.js';
import { AppError, NotFoundError, ForbiddenError } from '../utils/AppError.js';
import { paymentProvider } from '../providers/payment/index.js';
import {
  insertPayment,
  findPaymentByProviderRefTx,
  findPaymentByProviderRef,
  updatePaymentStatusTx,
} from '../repositories/payments.repository.js';
import {
  findOrderById,
  findOrderByIdTx,
  findOrderItems,
  updateOrderStatusTx,
  insertOrderStatusHistoryTx,
} from '../repositories/orders.repository.js';
import {
  confirmReservationsForOrderTx,
  releaseReservationsForOrderTx,
} from '../repositories/reservations.repository.js';
import { findCartByOwnerTx, clearOrderedItemsFromCartTx } from '../repositories/carts.repository.js';
import { findProductsByIds } from '../repositories/products.repository.js';
import { invalidateProductsPagesBatch } from './pageCacheInvalidation.js';
import { enqueueEmail } from './emailService.js';
import { insertCouponUsageTx } from '../repositories/coupons.repository.js';

// Called right after checkoutService.createOrder() commits (plan §11) — a
// separate step because talking to a payment gateway is I/O that doesn't
// belong inside the DB transaction that reserved the stock.
export async function createPaymentIntent(order) {
  const intent = await paymentProvider.createIntent(order);
  return insertPayment({
    orderId: order.id,
    provider: intent.provider,
    providerRef: intent.providerRef,
    status: 'PENDING',
    amount: order.total_amount,
  });
}

// The only thing that ever confirms an order (plan §11 correction) — never
// trust the frontend's own "payment succeeded" redirect. Idempotent: a
// repeat delivery of the same providerRef's terminal outcome is a no-op.
export async function confirmPayment(rawBody, signature) {
  if (!paymentProvider.verifySignature(rawBody, signature)) {
    throw new ForbiddenError('Invalid webhook signature');
  }

  const payload = JSON.parse(rawBody);
  const { providerRef, status } = payload;
  if (!providerRef || !['SUCCEEDED', 'FAILED'].includes(status)) {
    throw new AppError(400, 'Malformed webhook payload');
  }

  const result = await withTransaction(async (client) => {
    const payment = await findPaymentByProviderRefTx(client, providerRef);
    if (!payment) throw new NotFoundError('Unknown payment reference');

    if (payment.status !== 'PENDING') {
      return { alreadyProcessed: true, payment, orderId: payment.order_id };
    }

    if (status === 'SUCCEEDED') {
      await updatePaymentStatusTx(client, payment.id, 'SUCCEEDED', payload);
      await updateOrderStatusTx(client, payment.order_id, 'CONFIRMED');
      await insertOrderStatusHistoryTx(client, payment.order_id, 'CONFIRMED', 'Payment confirmed');
      await confirmReservationsForOrderTx(client, payment.order_id);

      // Coupon is only actually consumed here (plan §11) — checkout merely
      // validated it. ON CONFLICT DO NOTHING (see insertCouponUsageTx) makes
      // a repeat webhook delivery for the same order a safe no-op.
      const orderForCoupon = await findOrderByIdTx(client, payment.order_id);
      if (orderForCoupon.coupon_id) {
        await insertCouponUsageTx(client, {
          couponId: orderForCoupon.coupon_id,
          userId: orderForCoupon.user_id,
          orderId: orderForCoupon.id,
        });
      }

      // Remove exactly the items this order paid for from the shopper's
      // cart — see clearOrderedItemsFromCartTx for why this can't be a
      // blanket "empty the cart" (Buy Now reuses this same confirm path).
      const cart = await findCartByOwnerTx(client, { userId: orderForCoupon.user_id });
      if (cart) await clearOrderedItemsFromCartTx(client, cart.id, payment.order_id);
    } else {
      await updatePaymentStatusTx(client, payment.id, 'FAILED', payload);
      await updateOrderStatusTx(client, payment.order_id, 'PAYMENT_FAILED');
      await insertOrderStatusHistoryTx(client, payment.order_id, 'PAYMENT_FAILED', 'Payment failed');
      // No retry-same-order flow exists yet, so hold no reservation hostage
      // waiting for one — release immediately rather than waiting for the
      // expiry sweep.
      await releaseReservationsForOrderTx(client, payment.order_id);
    }

    return { alreadyProcessed: false, payment, orderId: payment.order_id };
  });

  if (!result.alreadyProcessed) {
    const order = await findOrderById(result.orderId);
    if (status === 'SUCCEEDED') {
      await invalidateOrderProductPages(result.orderId);
      await enqueueEmail(order.contact_email, 'ORDER_CONFIRMED', {
        contactName: order.contact_name,
        orderNumber: order.order_number,
        totalAmount: order.total_amount,
      });
    } else {
      await enqueueEmail(order.contact_email, 'PAYMENT_FAILED', {
        contactName: order.contact_name,
        orderNumber: order.order_number,
      });
    }
  }

  return result;
}

async function invalidateOrderProductPages(orderId) {
  try {
    const items = await findOrderItems(orderId);
    const products = await findProductsByIds(items.map((i) => i.product_id));
    await invalidateProductsPagesBatch(products);
  } catch (err) {
    console.error('Page cache invalidation after payment confirm failed:', err);
  }
}

// Dev-only stand-in for "the customer completed payment on the gateway's
// page" (plan §11 stub scope) — constructs a properly signed payload via
// the same signPayload() a real provider's servers would use, then runs it
// through the exact same confirmPayment() the public webhook uses. Requires
// the order to belong to the caller so a guessed providerRef can't be used
// to confirm someone else's order.
export async function simulatePayment(userId, providerRef, outcome) {
  const payment = await findPaymentByProviderRef(providerRef);
  if (!payment) throw new NotFoundError('Unknown payment reference');

  const order = await findOrderById(payment.order_id);
  if (!order || order.user_id !== userId) throw new ForbiddenError('Not your order');

  const { body, signature } = paymentProvider.signPayload({ providerRef, status: outcome });
  return confirmPayment(body, signature);
}
