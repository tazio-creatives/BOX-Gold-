import { withTransaction } from '../config/db.js';
import { AppError, NotFoundError } from '../utils/AppError.js';
import { env } from '../config/env.js';
import { generateOrderNumber } from '../utils/orderNumber.js';
import { findAddressById } from '../repositories/addresses.repository.js';
import { getCurrentGoldRate } from '../repositories/goldRates.repository.js';
import { findDiamondConfigById } from '../repositories/diamondConfigs.repository.js';
import {
  lockProductForCheckoutTx,
  lockProductSizeForCheckoutTx,
  insertOrderTx,
  insertOrderItemTx,
  insertOrderStatusHistoryTx,
} from '../repositories/orders.repository.js';
import { getActiveReservedQuantityTx, insertReservationTx } from '../repositories/reservations.repository.js';
import { computeVariantPricing } from './pricingService.js';
import { validateCoupon } from './couponService.js';

function round2(n) {
  return Math.round(n * 100) / 100;
}

function addressSnapshot(address) {
  return {
    type: address.type,
    name: address.name,
    mobileNumber: address.mobile_number,
    addressLine: address.address_line,
    building: address.building,
    landmark: address.landmark,
    city: address.city,
    state: address.state,
    pincode: address.pincode,
    country: address.country,
  };
}

// Checkout submit (plan §11, corrected two-phase split): creates a
// PENDING_PAYMENT order with its price snapshot + a concurrency-safe stock
// reservation per line item, all in one transaction. Never confirms the
// order itself — only the payment webhook (Phase 11) does that.
export async function createOrder({ userId, contact, addressId, items, couponCode }) {
  const address = await findAddressById(addressId);
  if (!address || address.user_id !== userId) throw new NotFoundError('Address not found');

  if (items.length === 0) throw new AppError(400, 'No items to checkout');

  // Ascending product_id lock order (plan §11) — every checkout transaction
  // acquires row locks in the same order, so two concurrent multi-item
  // checkouts sharing a product can never deadlock against each other.
  // Secondary sort by sizeId keeps a deterministic order across a single
  // product's own size rows too.
  const sortedItems = [...items].sort(
    (a, b) => a.productId.localeCompare(b.productId) || (a.sizeId ?? '').localeCompare(b.sizeId ?? ''),
  );

  const order = await withTransaction(async (client) => {
    const lineData = [];
    let subtotal = 0;
    let gstTotal = 0;
    let grandTotal = 0;

    for (const { productId, quantity, sizeId, goldColor, purity, diamondConfigId } of sortedItems) {
      const product = await lockProductForCheckoutTx(client, productId);
      if (!product || product.status !== 'PUBLISHED') {
        throw new AppError(400, `${product?.name ?? 'This item'} is no longer available`);
      }

      // Row-level locks don't cascade — a sized line also locks its own
      // product_sizes row so the stock check+reserve is atomic for that size.
      let size = null;
      if (sizeId) {
        size = await lockProductSizeForCheckoutTx(client, sizeId);
        if (!size || size.product_id !== product.id) {
          throw new AppError(400, `${product.name}: selected size is no longer available`);
        }
      }

      const reserved = await getActiveReservedQuantityTx(client, productId, sizeId ?? null);
      const stockQuantity = size ? size.stock_quantity : product.stock_quantity;
      const available = stockQuantity - reserved;
      if (available < quantity) {
        throw new AppError(
          400,
          `${product.name} only has ${Math.max(available, 0)} left in stock`,
        );
      }

      // Purity/diamond quality don't gate stock (only size does, locked
      // above) — they gate price, recomputed here from the same engine
      // cart used so checkout charges exactly what the shopper saw.
      const pricing = await computeVariantPricing(product, { purity, diamondConfigId });
      let diamondConfigName = null;
      if (pricing.diamondConfigId) {
        const config = await findDiamondConfigById(pricing.diamondConfigId);
        diamondConfigName = config?.name ?? null;
      }

      const lineGoldValue = round2(pricing.goldValue * quantity);
      const lineDiamondValue = round2(pricing.diamondValue * quantity);
      const lineMakingCharge = round2(pricing.makingCharge * quantity);
      const unitPrice = pricing.sellingPrice;
      const lineTotal = round2(unitPrice * quantity);
      const lineGst = round2(lineTotal - lineGoldValue - lineDiamondValue - lineMakingCharge);

      let goldRateId = null;
      if (product.metal_type === 'GOLD' && pricing.purity) {
        const rate = await getCurrentGoldRate(pricing.purity);
        goldRateId = rate?.id ?? null;
      }

      lineData.push({
        product,
        size,
        quantity,
        lineGoldValue,
        lineDiamondValue,
        lineMakingCharge,
        lineGst,
        unitPrice,
        lineTotal,
        goldRateId,
        goldColor: goldColor ?? product.gold_color,
        purity: pricing.purity,
        diamondConfigId: pricing.diamondConfigId,
        diamondConfigName,
      });
      subtotal += lineTotal - lineGst;
      gstTotal += lineGst;
      grandTotal += lineTotal;
    }

    // Coupon is validated now (so a bad/expired/exhausted code fails checkout
    // immediately) but not marked used yet — plan §11: only the payment
    // webhook actually consumes it, so an order that never gets paid never
    // burns the shopper's usage allowance.
    let discountAmount = 0;
    let couponId = null;
    let couponCodeSnapshot = null;
    if (couponCode) {
      const { coupon, discountAmount: amount } = await validateCoupon(couponCode, userId, grandTotal);
      discountAmount = amount;
      couponId = coupon.id;
      couponCodeSnapshot = coupon.code;
      grandTotal = round2(grandTotal - discountAmount);
    }

    const orderRow = await insertOrderTx(client, {
      orderNumber: generateOrderNumber(),
      userId,
      status: 'PENDING_PAYMENT',
      contactName: contact.name,
      contactMobile: contact.mobile,
      contactEmail: contact.email,
      shippingAddress: addressSnapshot(address),
      subtotal: round2(subtotal),
      discountAmount: round2(discountAmount),
      gstAmount: round2(gstTotal),
      shippingAmount: 0,
      totalAmount: round2(grandTotal),
      couponId,
      couponCode: couponCodeSnapshot,
    });

    for (const line of lineData) {
      await insertOrderItemTx(client, {
        orderId: orderRow.id,
        productId: line.product.id,
        productName: line.product.name,
        productSku: line.product.sku,
        quantity: line.quantity,
        goldValue: line.lineGoldValue,
        diamondValue: line.lineDiamondValue,
        makingCharge: line.lineMakingCharge,
        gstAmount: line.lineGst,
        unitPrice: line.unitPrice,
        lineTotal: line.lineTotal,
        goldRateId: line.goldRateId,
        productSizeId: line.size?.id,
        productSizeLabel: line.size?.label,
        goldColor: line.goldColor,
        purity: line.purity,
        diamondConfigId: line.diamondConfigId,
        diamondConfigName: line.diamondConfigName,
      });

      const expiresAt = new Date(Date.now() + env.reservationTtlMinutes * 60_000);
      await insertReservationTx(client, {
        productId: line.product.id,
        productSizeId: line.size?.id,
        orderId: orderRow.id,
        quantity: line.quantity,
        expiresAt,
      });
    }

    await insertOrderStatusHistoryTx(client, orderRow.id, 'PENDING_PAYMENT');

    return orderRow;
  });

  return order;
}
