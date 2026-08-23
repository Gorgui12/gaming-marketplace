import { Router } from 'express';
import { UserRole } from '@gm/types';
import { requireAuth } from '../../middlewares/auth.middleware.js';
import { requireRole } from '../../middlewares/rbac.middleware.js';
import { getAdminStats } from './admin-stats.controller.js';
import { listAdminUsers, updateUserStatus } from './admin-users.controller.js';
import { listAdminDisputes, resolveAdminDispute } from './admin-disputes.controller.js';
import { listAdminTransactions } from './admin-transactions.controller.js';

export const adminRouter = Router();

adminRouter.use(requireAuth, requireRole(UserRole.ADMIN, UserRole.SUPER_ADMIN));

// Dashboard
adminRouter.get('/stats', getAdminStats);

// Utilisateurs
adminRouter.get('/users', listAdminUsers);
adminRouter.patch('/users/:id/status', updateUserStatus);

// Litiges
adminRouter.get('/disputes', listAdminDisputes);
adminRouter.post('/disputes/:id/resolve', resolveAdminDispute);

// Transactions
adminRouter.get('/transactions', listAdminTransactions);
