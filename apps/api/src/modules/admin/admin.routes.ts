import { Router } from 'express';
import { UserRole } from '@gm/types';
import { requireAuth } from '../../middlewares/auth.middleware.js';
import { requireRole } from '../../middlewares/rbac.middleware.js';
import { adminEmailRateLimiter } from '../../middlewares/rate-limit.middleware.js';
import { getAdminStats } from './admin-stats.controller.js';
import {
  deleteAdminUser,
  listAdminUsers,
  updateUserEmailVerified,
  updateUserRoles,
  updateUserStatus,
} from './admin-users.controller.js';
import {
  cleanupDbOrphans,
  getDbStats,
  resetDbCollection,
} from './admin-maintenance.controller.js';
import { listAdminDisputes, resolveAdminDispute } from './admin-disputes.controller.js';
import { listAdminTransactions } from './admin-transactions.controller.js';
import {
  countRecipients,
  getEmailSend,
  getEmailStatus,
  listEmailSends,
  previewEmail,
  sendEmailBroadcast,
  sendEmailTest,
  testEmail,
} from './admin-email.controller.js';
import {
  listCampaigns,
  previewCampaign,
  sendTestNewsletter,
} from './admin-newsletter.controller.js';

export const adminRouter = Router();

adminRouter.use(requireAuth, requireRole(UserRole.ADMIN, UserRole.SUPER_ADMIN));

// Dashboard
adminRouter.get('/stats', getAdminStats);
adminRouter.get('/email/status', getEmailStatus);
adminRouter.post('/email/test', testEmail);

// Utilisateurs
adminRouter.get('/users', listAdminUsers);
adminRouter.patch('/users/:id/status', updateUserStatus);
adminRouter.patch('/users/:id/email-verified', updateUserEmailVerified);
adminRouter.patch('/users/:id/roles', updateUserRoles);
adminRouter.delete('/users/:id', deleteAdminUser);

// Litiges
adminRouter.get('/disputes', listAdminDisputes);
adminRouter.post('/disputes/:id/resolve', resolveAdminDispute);

// Transactions
adminRouter.get('/transactions', listAdminTransactions);

// Newsletter
adminRouter.get('/newsletter/history', listCampaigns);
adminRouter.get('/newsletter/preview', previewCampaign);
adminRouter.post('/newsletter/test', sendTestNewsletter);

// Envois d'emails rédigés depuis le back-office.
//
// `adminEmailRateLimiter` couvre le test ET l'envoi, pas seulement l'envoi :
// les deux clavier sont à portée immédiate l'un de l'autre dans l'interface,
// et c'est le test qu'on déclenche en boucle pendant qu'on écrit. 30 par heure
// laisse écrire, relire, tester et corriger plusieurs fois sans coincer.
//
// Il ne protège pas `preview` ni `recipients`, qui ne contactent personne : les
// brider transformerait la rédaction en exercice d'attente, alors que ce sont
// précisément les appels à multiplier en rédigeant.
adminRouter.get('/emails/recipients', countRecipients);
adminRouter.post('/emails/preview', previewEmail);
adminRouter.post('/emails/test', adminEmailRateLimiter, sendEmailTest);
adminRouter.post('/emails/send', adminEmailRateLimiter, sendEmailBroadcast);
adminRouter.get('/emails/history', listEmailSends);
adminRouter.get('/emails/:id', getEmailSend);

// Maintenance base de données
adminRouter.get('/db', getDbStats);
adminRouter.post('/db/orphans/cleanup', cleanupDbOrphans);
// Actions destructives réservées au SUPER_ADMIN.
adminRouter.post('/db/reset', requireRole(UserRole.SUPER_ADMIN), resetDbCollection);