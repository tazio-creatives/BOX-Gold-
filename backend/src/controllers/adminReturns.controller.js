import { findOrderById } from '../repositories/orders.repository.js';
import { findReturnRequestByOrderId, updateReturnRequestStatus } from '../repositories/returnRequests.repository.js';
import { updateReturnRequestStatusSchema } from '../validators/orders.validators.js';
import { NotFoundError, AppError } from '../utils/AppError.js';

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
    resolvedByAdminName: row.resolved_by_admin_name ?? null,
  };
}

export async function get(req, res, next) {
  try {
    const order = await findOrderById(req.params.id);
    if (!order) throw new NotFoundError('Order not found');
    const returnRequest = await findReturnRequestByOrderId(order.id);
    res.json({ returnRequest: toReturnRequestDto(returnRequest) });
  } catch (err) {
    next(err);
  }
}

// Approve/Reject only — a lightweight review trail independent of
// order_status (which the admin continues to manage via the existing
// Change Status control, same as before this feature existed). COMPLETED
// is set automatically when order_status moves to RETURNED, not through
// this endpoint — see adminOrders.controller.js::updateStatus.
export async function updateStatus(req, res, next) {
  try {
    const order = await findOrderById(req.params.id);
    if (!order) throw new NotFoundError('Order not found');
    const existing = await findReturnRequestByOrderId(order.id);
    if (!existing) throw new NotFoundError('No return request found for this order');
    if (existing.status !== 'REQUESTED') {
      throw new AppError(400, `Return request is already ${existing.status}`);
    }

    const { status } = updateReturnRequestStatusSchema.parse(req.body);
    await updateReturnRequestStatus(existing.id, status, req.admin.id);
    const updated = await findReturnRequestByOrderId(order.id);
    res.json({ returnRequest: toReturnRequestDto(updated) });
  } catch (err) {
    next(err);
  }
}
