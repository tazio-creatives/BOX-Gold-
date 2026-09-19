import { listOrdersQuerySchema, orderSummaryQuerySchema, updateOrderStatusSchema } from '../validators/orders.validators.js';
import { withTransaction } from '../config/db.js';
import {
  findAllOrders,
  findOrderById,
  findOrderItems,
  findOrderStatusHistoryForAdmin,
  getOrderSummaryStats,
  updateOrderStatusTx,
  updateOrderStatusFieldsTx,
  insertOrderStatusHistoryTx,
  hasOrderStatusHistoryEntry,
} from '../repositories/orders.repository.js';
import { findShipmentByOrderId, findTrackingEventsByShipmentId } from '../repositories/shipments.repository.js';
import { findWorkOrderPrints } from '../repositories/workOrderPrints.repository.js';
import { findInvoicePrints } from '../repositories/invoices.repository.js';
import { toOrderDto, toShipmentDto, orderDeliveryEstimateDto } from '../utils/orderDto.js';
import { assertManualTransitionAllowed, ORDER_STATUS_TO_LEGACY_STATUS } from '../utils/orderStatus.js';
import { NotFoundError, AppError } from '../utils/AppError.js';
import { enqueueEmail } from '../services/emailService.js';

// Only order_status values with a real customer-facing template — a manual
// override to DELAYED or RETURNED (no template exists, and the spec's own
// §10 notification list doesn't call for one) is a silent, email-free
// change. "Do not send multiple notifications for the same status" is
// enforced by the caller checking hasOrderStatusHistoryEntry BEFORE writing
// the new history row, not here.
const NOTIFY_TEMPLATE_FOR_STATUS = {
  PROCESSING: 'ORDER_PROCESSING',
  CANCELLED: 'ORDER_CANCELLED',
  DELIVERY_FAILED: 'ORDER_DELIVERY_FAILED',
  RETURN_INITIATED: 'ORDER_RETURN_INITIATED',
};

async function notifyStatusChangeIfNew(order, status, alreadyNotified) {
  const template = NOTIFY_TEMPLATE_FOR_STATUS[status];
  if (!template || alreadyNotified) return;
  await enqueueEmail(order.contact_email, template, {
    contactName: order.contact_name,
    orderNumber: order.order_number,
  });
}

function toOrderListDto(order) {
  return {
    id: order.id,
    orderNumber: order.order_number,
    status: order.status,
    paymentStatus: order.payment_status,
    orderStatus: order.order_status,
    shipmentStatus: order.shipment_status,
    contactName: order.contact_name,
    contactMobile: order.contact_mobile,
    totalAmount: Number(order.total_amount),
    createdAt: order.created_at,
    productName: order.first_product_name ?? null,
    itemCount: order.item_count ?? 0,
    deliveryEstimate: orderDeliveryEstimateDto(order),
  };
}

export async function list(req, res, next) {
  try {
    const q = listOrdersQuerySchema.parse(req.query);
    const { items, total } = await findAllOrders({
      status: q.status,
      search: q.search,
      page: q.page ?? 1,
      limit: q.limit ?? 20,
    });
    res.json({
      orders: items.map(toOrderListDto),
      page: q.page ?? 1,
      limit: q.limit ?? 20,
      total,
      totalPages: Math.ceil(total / (q.limit ?? 20)),
    });
  } catch (err) {
    next(err);
  }
}

// Sales card shown in the Orders page heading — one lightweight aggregate
// query, independent of pagination (matches dashboard.repository.js's
// revenue convention rather than summing whatever page happens to be loaded).
export async function summary(req, res, next) {
  try {
    const q = orderSummaryQuerySchema.parse(req.query);
    const stats = await getOrderSummaryStats({ status: q.status });
    const totalRevenue = Number(stats.total_revenue);
    const revenueOrderCount = stats.revenue_order_count;
    res.json({
      totalOrders: stats.total_orders,
      totalRevenue,
      averageOrderValue: revenueOrderCount > 0 ? totalRevenue / revenueOrderCount : 0,
      toFulfilCount: stats.to_fulfil_count,
      ordersToday: stats.orders_today,
    });
  } catch (err) {
    next(err);
  }
}

async function loadOrderDto(orderId) {
  const order = await findOrderById(orderId);
  if (!order) throw new NotFoundError('Order not found');
  const [items, statusHistory, shipment, hasProcessed, workOrderPrints, invoicePrints] = await Promise.all([
    findOrderItems(order.id),
    findOrderStatusHistoryForAdmin(order.id),
    findShipmentByOrderId(order.id),
    hasOrderStatusHistoryEntry(order.id, 'PROCESSING'),
    findWorkOrderPrints(order.id),
    findInvoicePrints(order.id),
  ]);
  const trackingEvents = shipment ? await findTrackingEventsByShipmentId(shipment.id) : [];
  return toOrderDto(
    order,
    items,
    statusHistory,
    {
      shipment: toShipmentDto(shipment, trackingEvents),
      canPrintWorkOrder: hasProcessed,
      workOrderPrintCount: workOrderPrints.length,
      canPrintInvoice: order.payment_status === 'PAID',
      invoiceNumber: order.invoice_number,
      invoicePrintCount: invoicePrints.length,
    },
    { forAdmin: true },
  );
}

export async function get(req, res, next) {
  try {
    res.json({ order: await loadOrderDto(req.params.id) });
  } catch (err) {
    next(err);
  }
}

// Dedicated Confirmed -> Processing action (spec §3) — separate from the
// generic override below so it can enforce its own precondition (must
// currently be Confirmed) without the generic endpoint's broader,
// admin-chosen-target transition table.
export async function startProcessing(req, res, next) {
  try {
    const existing = await findOrderById(req.params.id);
    if (!existing) throw new NotFoundError('Order not found');
    if (existing.order_status !== 'CONFIRMED') {
      throw new AppError(
        400,
        `Order must be Confirmed to start processing (currently ${existing.order_status ?? 'awaiting payment'})`,
      );
    }

    const alreadyNotified = await hasOrderStatusHistoryEntry(existing.id, 'PROCESSING');

    await withTransaction(async (client) => {
      await updateOrderStatusTx(client, existing.id, 'PROCESSING');
      await updateOrderStatusFieldsTx(client, existing.id, { orderStatus: 'PROCESSING' });
      await insertOrderStatusHistoryTx(client, existing.id, 'PROCESSING', null, {
        actor: req.admin.id,
        source: 'ADMIN',
      });
    });
    await notifyStatusChangeIfNew(existing, 'PROCESSING', alreadyNotified);

    res.json({ order: await loadOrderDto(existing.id) });
  } catch (err) {
    next(err);
  }
}

// Manual admin override for the exception states (Cancelled, Delayed,
// Delivery Failed, Return Initiated, Returned) and Processing (redundant
// with startProcessing, kept for symmetry) — spec §7's transition table:
// courier-controlled statuses (Ready to Ship, Shipped, In Transit, Out for
// Delivery, Delivered) are deliberately NOT reachable here; those come from
// the Ready-to-Ship flow (Phase 3) or courier tracking, not a free-form
// admin dropdown. assertManualTransitionAllowed also rejects any change
// once the order is already in a terminal state (Delivered/Cancelled/
// Returned).
export async function updateStatus(req, res, next) {
  try {
    const existing = await findOrderById(req.params.id);
    if (!existing) throw new NotFoundError('Order not found');

    const { status, note } = updateOrderStatusSchema.parse(req.body);
    assertManualTransitionAllowed(existing.order_status, status);

    const alreadyNotified = await hasOrderStatusHistoryEntry(existing.id, status);

    await withTransaction(async (client) => {
      const legacyStatus = ORDER_STATUS_TO_LEGACY_STATUS[status];
      if (legacyStatus) await updateOrderStatusTx(client, existing.id, legacyStatus);
      await updateOrderStatusFieldsTx(client, existing.id, { orderStatus: status });
      await insertOrderStatusHistoryTx(client, existing.id, status, note ?? 'Status updated by admin', {
        actor: req.admin.id,
        source: 'ADMIN',
      });
    });
    await notifyStatusChangeIfNew(existing, status, alreadyNotified);

    res.json({ order: await loadOrderDto(existing.id) });
  } catch (err) {
    next(err);
  }
}
