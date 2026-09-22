import { Router } from 'express';
import { list, get, summary, startProcessing, markReadyToShip, updateStatus } from '../../controllers/adminOrders.controller.js';
import { get as getWorkOrder, recordPrint as recordWorkOrderPrint } from '../../controllers/adminWorkOrder.controller.js';
import { get as getInvoice, recordPrint as recordInvoicePrint } from '../../controllers/adminInvoice.controller.js';
import { get as getReturnRequest, updateStatus as updateReturnRequestStatus } from '../../controllers/adminReturns.controller.js';

// Mounted at /api/v1/admin/orders — every order, not scoped to one customer.
export const adminOrdersRouter = Router();

adminOrdersRouter.get('/', list);
// Must come before /:id — otherwise "summary" is parsed as an order id.
adminOrdersRouter.get('/summary', summary);
adminOrdersRouter.get('/:id', get);
adminOrdersRouter.post('/:id/start-processing', startProcessing);
adminOrdersRouter.post('/:id/mark-ready-to-ship', markReadyToShip);
adminOrdersRouter.patch('/:id/status', updateStatus);
adminOrdersRouter.get('/:id/work-order', getWorkOrder);
adminOrdersRouter.post('/:id/work-order/print', recordWorkOrderPrint);
adminOrdersRouter.get('/:id/invoice', getInvoice);
adminOrdersRouter.post('/:id/invoice/print', recordInvoicePrint);
adminOrdersRouter.get('/:id/return-request', getReturnRequest);
adminOrdersRouter.patch('/:id/return-request', updateReturnRequestStatus);
