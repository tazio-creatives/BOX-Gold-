import { Router } from 'express';
import { list, get, summary, startProcessing, updateStatus } from '../../controllers/adminOrders.controller.js';
import { get as getWorkOrder, recordPrint as recordWorkOrderPrint } from '../../controllers/adminWorkOrder.controller.js';
import { get as getInvoice, recordPrint as recordInvoicePrint } from '../../controllers/adminInvoice.controller.js';

// Mounted at /api/v1/admin/orders — every order, not scoped to one customer.
export const adminOrdersRouter = Router();

adminOrdersRouter.get('/', list);
// Must come before /:id — otherwise "summary" is parsed as an order id.
adminOrdersRouter.get('/summary', summary);
adminOrdersRouter.get('/:id', get);
adminOrdersRouter.post('/:id/start-processing', startProcessing);
adminOrdersRouter.patch('/:id/status', updateStatus);
adminOrdersRouter.get('/:id/work-order', getWorkOrder);
adminOrdersRouter.post('/:id/work-order/print', recordWorkOrderPrint);
adminOrdersRouter.get('/:id/invoice', getInvoice);
adminOrdersRouter.post('/:id/invoice/print', recordInvoicePrint);
