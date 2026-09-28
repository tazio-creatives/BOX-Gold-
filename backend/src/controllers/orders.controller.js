import { listOrdersQuerySchema } from '../validators/orders.validators.js';
import {
  findOrderById,
  findOrdersByUser,
  findOrderListExtras,
  findOrderItems,
  findOrderStatusHistory,
  getOrderStatsForUser,
} from '../repositories/orders.repository.js';
import { findShipmentByOrderId, findTrackingEventsByShipmentId } from '../repositories/shipments.repository.js';
import { findReviewsByOrderItemIds, findImagesByReviewIds } from '../repositories/reviews.repository.js';
import { toOrderDto, toShipmentDto, orderDeliveryEstimateDto } from '../utils/orderDto.js';
import { NotFoundError } from '../utils/AppError.js';

// Card-shaped list DTO, plus the account "My Orders" card's preview
// (item count/thumbnail) and progress-stepper timestamps — still no full
// items/history/shipment payload, just what that one screen needs (plan §13).
function toOrderListDto(order, extras) {
  const milestones = extras.milestones.get(order.id) ?? {};
  const preview = extras.previews.get(order.id) ?? null;
  return {
    id: order.id,
    orderNumber: order.order_number,
    paymentStatus: order.payment_status,
    orderStatus: order.order_status,
    totalAmount: Number(order.total_amount),
    createdAt: order.created_at,
    itemCount: extras.itemCounts.get(order.id) ?? 0,
    previewProductName: preview?.productName ?? null,
    previewImageUrl: preview?.imageUrl ?? null,
    confirmedAt: milestones.CONFIRMED ?? null,
    processingAt: milestones.PROCESSING ?? null,
    readyToShipAt: milestones.READY_TO_SHIP ?? null,
    shippedAt: milestones.SHIPPED ?? null,
    inTransitAt: milestones.IN_TRANSIT ?? null,
    outForDeliveryAt: milestones.OUT_FOR_DELIVERY ?? null,
    deliveredAt: milestones.DELIVERED ?? null,
    deliveryEstimate: orderDeliveryEstimateDto(order),
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
    const extras = await findOrderListExtras(items.map((o) => o.id));
    res.json({
      orders: items.map((o) => toOrderListDto(o, extras)),
      page: q.page ?? 1,
      limit: q.limit ?? 10,
      total,
      totalPages: Math.ceil(total / (q.limit ?? 10)),
    });
  } catch (err) {
    next(err);
  }
}

export async function stats(req, res, next) {
  try {
    const row = await getOrderStatsForUser(req.customer.id);
    res.json({
      totalOrders: row.total_orders,
      activeOrders: row.active_orders,
      totalSpent: Number(row.total_spent),
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
    // Customer-facing tracking timeline — same trackingEvents the admin
    // view shows (courier status/location/note), just without the
    // forAdmin:true flag that would add internal actor names to
    // statusHistory (see toOrderDto's comment on that flag).
    const trackingEvents = shipment ? await findTrackingEventsByShipmentId(shipment.id) : [];
    const dto = toOrderDto(order, items, statusHistory, { shipment: toShipmentDto(shipment, trackingEvents) });

    // "Write a Review" eligibility (plan §11a) — only meaningful once the
    // order has actually been delivered, and only for items not already
    // reviewed (the DB also enforces one review per order_item, this just
    // saves the customer from submitting a form that would 400). The
    // review itself (whatever its moderation status) is attached
    // regardless of the order's current status — a later status change
    // (e.g. a return) must not make an already-submitted review vanish
    // from the page.
    const reviews = await findReviewsByOrderItemIds(items.map((i) => i.id));
    const imagesByReviewId = await findImagesByReviewIds(reviews.map((r) => r.id));
    const reviewsByItemId = new Map(reviews.map((r) => [r.order_item_id, r]));
    dto.items = dto.items.map((item) => {
      const review = reviewsByItemId.get(item.id) ?? null;
      return {
        ...item,
        canReview: order.order_status === 'DELIVERED' && !review,
        review: review
          ? {
              id: review.id,
              rating: review.rating,
              title: review.title,
              body: review.body,
              status: review.status,
              images: imagesByReviewId.get(review.id) ?? [],
            }
          : null,
      };
    });

    res.json({ order: dto });
  } catch (err) {
    next(err);
  }
}
