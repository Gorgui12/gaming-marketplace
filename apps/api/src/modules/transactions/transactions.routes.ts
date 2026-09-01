import { Router } from 'express';
import { requireAuth } from '../../middlewares/auth.middleware.js';
import { requireRole } from '../../middlewares/rbac.middleware.js';
import { UserRole } from '@gm/types';
import {
  adminRefundTransaction,
  adminReleaseTransaction,
  confirmTransaction,
  createTransaction,
  deliverTransaction,
  getTransaction,
  getTransactionAccess,
  listMyTransactions,
  verifyTransactionPayment,
} from './transactions.controller.js';

export const transactionsRouter = Router();

transactionsRouter.use(requireAuth);
transactionsRouter.post('/', createTransaction);
transactionsRouter.get('/mine', listMyTransactions);
transactionsRouter.get('/:id', getTransaction);
transactionsRouter.get('/:id/access', getTransactionAccess);
transactionsRouter.post('/:id/deliver', deliverTransaction);
transactionsRouter.post('/:id/confirm', confirmTransaction);
transactionsRouter.post('/:id/verify-payment', verifyTransactionPayment);
transactionsRouter.post(
  '/:id/admin-refund',
  requireRole(UserRole.ADMIN, UserRole.SUPER_ADMIN),
  adminRefundTransaction,
);
transactionsRouter.post(
  '/:id/admin-release',
  requireRole(UserRole.ADMIN, UserRole.SUPER_ADMIN),
  adminReleaseTransaction,
);