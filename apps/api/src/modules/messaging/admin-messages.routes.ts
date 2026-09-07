import { Router } from 'express';
import { UserRole } from '@gm/types';
import { requireAuth } from '../../middlewares/auth.middleware.js';
import { requireRole } from '../../middlewares/rbac.middleware.js';
import { listBlockedMessages } from './admin-messages.controller.js';

export const adminMessagesRouter = Router();

adminMessagesRouter.use(requireAuth, requireRole(UserRole.ADMIN, UserRole.SUPER_ADMIN));

// §15 — messages contenant des coordonnées, bloqués et signalés
// automatiquement par la messagerie.
adminMessagesRouter.get('/messages/blocked', listBlockedMessages);