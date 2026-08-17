import { listOrdersQuerySchema } from '../validators/orders.validators.js';
import {
  findOrderById,
  findOrdersByUser,
  findOrderItems,
  findOrderStatusHistory,
} from '../repositories/orders.repository.js';
import { findShipmentByOrderId } from '../repositories/shipments.repository.js';
import { findReviewedOrderItemIds } from '../repositories/reviews.repository.js';
import { toOrderDto, toShipmentDto } from '../utils/orderDto.js';
import { NotFoundError } from '../utils/AppError.js';

// Card-shaped list DTO — no items/history/shipment, matches the "server
// sends only fields each screen needs" pattern used elsewhere (plan §13).
function toOrderListDto(order) {
  return {
    id: order.id,
    orderNumber: order.order_number,
    status: order.status,
    totalAmount: Number(order.total_amount),
    createdAt: order.created_at,
  };
}

export async function list(req, res, next) {
  try {
    const q = listOrdersQuerySchema.parse(req.query);
    const { items, total } = await findOrdersByUser(req.customer.id, {
      status: q.status,
      page: q.page ?? 1,
      limit: q.limit ?? 10,
    });
    res.json({
      orders: items.map(toOrderListDto),
      page: q.page ?? 1,
      limit: q.limit ?? 10,
      total,
      totalPages: Math.ceil(total / (q.limit ?? 10)),
    });
  } catch (err) {
    next(err);
  }
}

async function loadOwnedOrder(req) {
  const order = await findOrderById(req.params.id);
  if (!order || order.user_id !== req.customer.id) throw new NotFoundError('Order not found');
  return order;
}

export async function get(req, res, next) {
  try {
    const order = await loadOwnedOrder(req);
    const [items, statusHistory, shipment] = await Promise.all([
      findOrderItems(order.id),
      findOrderStatusHistory(order.id),
      findShipmentByOrderId(order.id),
    ]);
    const dto = toOrderDto(order, items, statusHistory, { shipment: toShipmentDto(shipment) });

    // "Write a Review" eligibility (plan §11a) — only meaningful once the
    // order has actually been delivered, and only for items not already
    // reviewed (the DB also enforces one review per order_item, this just
    // saves the customer from submitting a form that would 400).
    if (order.status === 'DELIVERED') {
      const reviewedIds = new Set(await findReviewedOrderItemIds(items.map((i) => i.id)));
      dto.items = dto.items.map((item) => ({ ...item, canReview: !reviewedIds.has(item.id) }));
    } else {
      dto.items = dto.items.map((item) => ({ ...item, canReview: false }));
    }

    res.json({ order: dto });
  } catch (err) {
    next(err);
  }
}
