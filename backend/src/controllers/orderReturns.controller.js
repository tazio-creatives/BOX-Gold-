import crypto from 'node:crypto';
import { withTransaction } from '../config/db.js';
import { createReturnRequestSchema } from '../validators/orders.validators.js';
import {
  findOrderById,
  findOrderStatusHistory,
  updateOrderStatusFieldsTx,
  insertOrderStatusHistoryTx,
} from '../repositories/orders.repository.js';
import {
  findReturnRequestByOrderId,
  hasActiveReturnRequest,
  insertReturnRequest,
} from '../repositories/returnRequests.repository.js';
import { storageProvider } from '../providers/storage/index.js';
import { RETURN_WINDOW_DAYS } from '../utils/orderStatus.js';
import { NotFoundError, AppError } from '../utils/AppError.js';

async function loadOwnedOrder(req) {
  const order = await findOrderById(req.params.id);
  if (!order || order.user_id !== req.customer.id) throw new NotFoundError('Order not found');
  return order;
}

function toReturnRequestDto(row) {
  if (!row) return null;
  return {
    id: row.id,
    reason: row.reason,
    note: row.note,
    videoUrl: row.video_url,
    status: row.status,
    createdAt: row.created_at,
    resolvedAt: row.resolved_at,
  };
}

export async function get(req, res, next) {
  try {
    const order = await loadOwnedOrder(req);
    const returnRequest = await findReturnRequestByOrderId(order.id);
    res.json({ returnRequest: toReturnRequestDto(returnRequest) });
  } catch (err) {
    next(err);
  }
}

export async function create(req, res, next) {
  try {
    const order = await loadOwnedOrder(req);
    const { reason, note } = createReturnRequestSchema.parse(req.body);

    if (order.order_status !== 'DELIVERED') {
      throw new AppError(400, 'Only a delivered order can be returned');
    }

    const history = await findOrderStatusHistory(order.id);
    const deliveredAt = history.find((h) => h.status === 'DELIVERED')?.created_at;
    const deadline = deliveredAt ? new Date(deliveredAt).getTime() + RETURN_WINDOW_DAYS * 24 * 60 * 60 * 1000 : 0;
    if (!deliveredAt || Date.now() > deadline) {
      throw new AppError(400, `Return requests must be submitted within ${RETURN_WINDOW_DAYS} days of delivery`);
    }

    if (await hasActiveReturnRequest(order.id)) {
      throw new AppError(400, 'A return request is already in progress for this order');
    }

    let videoUrl = null;
    if (req.file) {
      const ext = req.file.mimetype === 'video/quicktime' ? 'mov' : req.file.mimetype.split('/')[1];
      const key = `returns/${order.id}/${crypto.randomUUID()}.${ext}`;
      const saved = await storageProvider.save(key, req.file.buffer);
      videoUrl = saved.url;
    }

    const returnRequest = await withTransaction(async (client) => {
      const inserted = await insertReturnRequest(order.id, { reason, note, videoUrl });
      await updateOrderStatusFieldsTx(client, order.id, { orderStatus: 'RETURN_INITIATED' });
      await insertOrderStatusHistoryTx(
        client,
        order.id,
        'RETURN_INITIATED',
        `Return requested by customer (${reason})`,
        { source: 'CUSTOMER' },
      );
      return inserted;
    });

    res.status(201).json({ returnRequest: toReturnRequestDto(returnRequest) });
  } catch (err) {
    next(err);
  }
}
