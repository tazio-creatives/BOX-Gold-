import { listOrdersQuerySchema, updateOrderStatusSchema } from '../validators/orders.validators.js';
import { withTransaction } from '../config/db.js';
import {
  findAllOrders,
  findOrderById,
  findOrderItems,
  findOrderStatusHistory,
  updateOrderStatusTx,
  insertOrderStatusHistoryTx,
} from '../repositories/orders.repository.js';
import { findShipmentByOrderId, findTrackingEventsByShipmentId } from '../repositories/shipments.repository.js';
import { toOrderDto, toShipmentDto } from '../utils/orderDto.js';
import { NotFoundError } from '../utils/AppError.js';

function toOrderListDto(order) {
  return {
    id: order.id,
    orderNumber: order.order_number,
    status: order.status,
    contactName: order.contact_name,
    contactMobile: order.contact_mobile,
    totalAmount: Number(order.total_amount),
    createdAt: order.created_at,
    productName: order.first_product_name ?? null,
    itemCount: order.item_count ?? 0,
  };
}

export async function list(req, res, next) {
  try {
    const q = listOrdersQuerySchema.parse(req.query);
    const { items, total } = await findAllOrders({
      status: q.status,
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

export async function get(req, res, next) {
  try {
    const order = await findOrderById(req.params.id);
    if (!order) throw new NotFoundError('Order not found');
    const [items, statusHistory, shipment] = await Promise.all([
      findOrderItems(order.id),
      findOrderStatusHistory(order.id),
      findShipmentByOrderId(order.id),
    ]);
    const trackingEvents = shipment ? await findTrackingEventsByShipmentId(shipment.id) : [];
    res.json({
      order: toOrderDto(order, items, statusHistory, { shipment: toShipmentDto(shipment, trackingEvents) }),
    });
  } catch (err) {
    next(err);
  }
}

// Manual admin override — the order otherwise only ever moves status via
// payment/shipping webhooks (paymentService/shippingService). This exists
// for the cases those flows don't cover: correcting a mistake, marking a
// return REFUNDED, etc. Any of the known statuses is allowed; the note is
// what makes an out-of-band change traceable in the order timeline.
export async function updateStatus(req, res, next) {
  try {
    const existing = await findOrderById(req.params.id);
    if (!existing) throw new NotFoundError('Order not found');

    const { status, note } = updateOrderStatusSchema.parse(req.body);
    await withTransaction(async (client) => {
      await updateOrderStatusTx(client, existing.id, status);
      await insertOrderStatusHistoryTx(client, existing.id, status, note ?? 'Status updated by admin');
    });

    const order = await findOrderById(existing.id);
    const [items, statusHistory, shipment] = await Promise.all([
      findOrderItems(order.id),
      findOrderStatusHistory(order.id),
      findShipmentByOrderId(order.id),
    ]);
    const trackingEvents = shipment ? await findTrackingEventsByShipmentId(shipment.id) : [];
    res.json({
      order: toOrderDto(order, items, statusHistory, { shipment: toShipmentDto(shipment, trackingEvents) }),
    });
  } catch (err) {
    next(err);
  }
}
