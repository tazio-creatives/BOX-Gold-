import { withTransaction } from '../config/db.js';
import { AppError, NotFoundError } from '../utils/AppError.js';
import { env } from '../config/env.js';
import { generateOrderNumber } from '../utils/orderNumber.js';
import { findAddressById } from '../repositories/addresses.repository.js';
import { getCurrentGoldRate } from '../repositories/goldRates.repository.js';
import { findDiamondConfigById } from '../repositories/diamondConfigs.repository.js';
import {
  lockProductForCheckoutTx,
  lockProductVariantForCheckoutTx,
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
export async function createOrder({ userId, contact, addressId, items, couponCode, deliveryNote }) {
  const address = await findAddressById(addressId);
  if (!address || address.user_id !== userId) throw new NotFoundError('Address not found');

  if (items.length === 0) throw new AppError(400, 'No items to checkout');

  // Ascending product_id, then variantId lock order (plan §11) — every
  // checkout transaction acquires row locks in the same order, so two
  // concurrent multi-item checkouts sharing a product can never deadlock
  // against each other.
  const sortedItems = [...items].sort(
    (a, b) => a.productId.localeCompare(b.productId) || (a.variantId ?? '').localeCompare(b.variantId ?? ''),
  );

  const order = await withTransaction(async (client) => {
    const lineData = [];
    let subtotal = 0;
    let gstTotal = 0;
    let grandTotal = 0;

    for (const { productId, variantId, quantity } of sortedItems) {
      const product = await lockProductForCheckoutTx(client, productId);
      if (!product || product.status !== 'PUBLISHED') {
        throw new AppError(400, `${product?.name ?? 'This item'} is no longer available`);
      }

      // Row-level locks don't cascade — every line also locks its own
      // product_variants row so the stock check+reserve is atomic for that
      // exact combination.
      let variant = null;
      if (variantId) {
        variant = await lockProductVariantForCheckoutTx(client, variantId);
        if (!variant || variant.product_id !== product.id) {
          throw new AppError(400, `${product.name}: selected combination is no longer available`);
        }
        if (!variant.is_available) {
          throw new AppError(400, `${product.name}: selected combination is no longer available`);
        }
      }

      const reserved = variant ? await getActiveReservedQuantityTx(client, variant.id) : 0;
      const stockQuantity = variant ? variant.stock_quantity : product.stock_quantity;
      const available = stockQuantity - reserved;
      // Make to Order: never blocks checkout. A line whose requested
      // quantity exceeds what's physically available becomes backordered in
      // full (no partial split between in-stock and backordered units) —
      // it gets no stock reservation below, and whatever's left of
      // `available` (if any) is deliberately left unreserved so it stays
      // purchasable by other, fully-in-stock orders.
      const isBackordered = quantity > available;

      // Buy Now skips cartService.addItem entirely and lands straight
      // here — resolve pricing (and combination validity) from the same
      // variant/pricing engine cart uses, so checkout charges exactly what
      // the shopper saw and can never sell an unavailable combination.
      const pricing = await computeVariantPricing(product, variant && variant.combination_key !== '' ? variant : null);
      let diamondConfigName = null;
      if (pricing.diamondConfigId) {
        const config = await findDiamondConfigById(pricing.diamondConfigId);
        diamondConfigName = config?.name ?? null;
      }

      const attributesSnapshot = [];
      if (pricing.purity) attributesSnapshot.push({ attributeCode: 'purity', label: pricing.purity });
      if (pricing.goldColor) attributesSnapshot.push({ attributeCode: 'gold_color', label: pricing.goldColor });
      if (diamondConfigName) attributesSnapshot.push({ attributeCode: 'diamond_quality', label: diamondConfigName });
      const sizeAttr = variant?.attributes?.size;
      if (sizeAttr) attributesSnapshot.push({ attributeCode: 'size', label: sizeAttr.label });

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
        variant,
        quantity,
        lineGoldValue,
        lineDiamondValue,
        lineMakingCharge,
        lineGst,
        unitPrice,
        lineTotal,
        goldRateId,
        attributesSnapshot,
        isBackordered,
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
      deliveryNote: deliveryNote || null,
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
        productVariantId: line.variant?.id ?? null,
        variantAttributesSnapshot: line.attributesSnapshot,
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
        isBackordered: line.isBackordered,
      });

      // A backordered line has nothing physical to hold — skip the
      // reservation entirely rather than reserving units that don't exist.
      if (!line.isBackordered && line.variant) {
        const expiresAt = new Date(Date.now() + env.reservationTtlMinutes * 60_000);
        await insertReservationTx(client, {
          productId: line.product.id,
          productVariantId: line.variant.id,
          orderId: orderRow.id,
          quantity: line.quantity,
          expiresAt,
        });
      }
    }

    await insertOrderStatusHistoryTx(client, orderRow.id, 'PENDING_PAYMENT');

    return orderRow;
  });

  return order;
}
