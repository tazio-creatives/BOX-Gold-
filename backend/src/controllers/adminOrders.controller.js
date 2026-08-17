import { listOrdersQuerySchema } from '../validators/orders.validators.js';
import {
  findAllOrders,
  findOrderById,
  findOrderItems,
  findOrderStatusHistory,
} from '../repositories/orders.repository.js';
import { findShipmentByOrderId } from '../repositories/shipments.repository.js';
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
    res.json({
      order: toOrderDto(order, items, statusHistory, { shipment: toShipmentDto(shipment) }),
    });
  } catch (err) {
    next(err);
  }
}
