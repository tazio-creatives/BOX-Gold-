import { Router } from 'express';
import { list } from '../../controllers/adminAuditLogs.controller.js';

export const adminAuditLogsRouter = Router();

adminAuditLogsRouter.get('/', list);
