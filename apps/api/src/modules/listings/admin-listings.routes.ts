import { Router } from 'express';
import type { Request, Response } from 'express';
import { UserRole } from '@gm/types';
import { requireAuth } from '../../middlewares/auth.middleware.js';
import { requireRole } from '../../middlewares/rbac.middleware.js';
import { asyncHandler } from '../../lib/async-handler.js';
import { ListingsModerationService } from './listings-moderation.service.js';

export const adminListingsRouter = Router();

adminListingsRouter.use(requireAuth, requireRole(UserRole.ADMIN, UserRole.SUPER_ADMIN));

adminListingsRouter.get(
  '/listings/pending',
  asyncHandler(async (_req: Request, res: Response) => {
    const listings = await ListingsModerationService.listPending();
    res.status(200).json({ success: true, data: { listings } });
  }),
);

adminListingsRouter.post(
  '/listings/:id/approve',
  asyncHandler(async (req: Request, res: Response) => {
    const listing = await ListingsModerationService.approve(req.params.id!, req.user!.id);
    res.status(200).json({ success: true, data: { listing } });
  }),
);

adminListingsRouter.post(
  '/listings/:id/reject',
  asyncHandler(async (req: Request, res: Response) => {
    const listing = await ListingsModerationService.reject(
      req.params.id!,
      req.user!.id,
      typeof req.body?.notes === 'string' ? req.body.notes : undefined,
    );
    res.status(200).json({ success: true, data: { listing } });
  }),
);
