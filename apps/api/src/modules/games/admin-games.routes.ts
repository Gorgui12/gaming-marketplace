import { Router } from 'express';
import { UserRole } from '@gm/types';
import { requireAuth } from '../../middlewares/auth.middleware.js';
import { requireRole } from '../../middlewares/rbac.middleware.js';
import { createGameAdmin, listGamesAdmin, updateGameAdmin } from './admin-games.controller.js';

export const adminGamesRouter = Router();

adminGamesRouter.use(requireAuth, requireRole(UserRole.ADMIN, UserRole.SUPER_ADMIN));
adminGamesRouter.get('/games', listGamesAdmin);
adminGamesRouter.post('/games', createGameAdmin);
adminGamesRouter.patch('/games/:id', updateGameAdmin);
