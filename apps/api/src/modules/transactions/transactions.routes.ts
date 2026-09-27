import { Router } from 'express';
import { requireAuth, requireEmailVerified } from '../../middlewares/auth.middleware.js';
import { requireRole } from '../../middlewares/rbac.middleware.js';
import { UserRole } from '@gm/types';
import {
  adminCancelTransaction,
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
// Seule l'OUVERTURE d'une transaction est bloquée sans email confirmé : c'est
// le moment où des fonds entrent en séquestre. Les étapes suivantes
// (livraison, confirmation, vérif paiement) restent ouvertes, sinon un compte
// créé avant la mise en place de la validation resterait coincé avec de
// l'argent bloqué chez nous — un dommage réel pour l'acheteur légitime.
transactionsRouter.post('/', requireEmailVerified, createTransaction);
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
transactionsRouter.post(
  '/:id/admin-cancel',
  requireRole(UserRole.ADMIN, UserRole.SUPER_ADMIN),
  adminCancelTransaction,
);