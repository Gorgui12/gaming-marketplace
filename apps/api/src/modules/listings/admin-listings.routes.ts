import { Router } from 'express';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { UserRole, ListingStatus } from '@gm/types';
import { requireAuth } from '../../middlewares/auth.middleware.js';
import { requireRole } from '../../middlewares/rbac.middleware.js';
import { asyncHandler } from '../../lib/async-handler.js';
import { ListingsModerationService } from './listings-moderation.service.js';

export const adminListingsRouter = Router();

adminListingsRouter.use(requireAuth, requireRole(UserRole.ADMIN, UserRole.SUPER_ADMIN));

const listAllQuerySchema = z.object({
  status: z.enum(Object.values(ListingStatus) as [string, ...string[]]).optional(),
  search: z.string().trim().max(200).optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});

adminListingsRouter.get(
  '/listings',
  asyncHandler(async (req: Request, res: Response) => {
    const query = listAllQuerySchema.parse(req.query);
    const data = await ListingsModerationService.listAll(query);
    res.status(200).json({ success: true, data });
  }),
);

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

adminListingsRouter.post(
  '/listings/:id/publish',
  asyncHandler(async (req: Request, res: Response) => {
    const listing = await ListingsModerationService.forcePublish(req.params.id!, req.user!.id);
    res.status(200).json({ success: true, data: { listing } });
  }),
);

adminListingsRouter.post(
  '/listings/:id/unpublish',
  asyncHandler(async (req: Request, res: Response) => {
    const listing = await ListingsModerationService.unpublish(req.params.id!, req.user!.id);
    res.status(200).json({ success: true, data: { listing } });
  }),
);

adminListingsRouter.delete(
  '/listings/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const result = await ListingsModerationService.hardDelete(req.params.id!, req.user!.id);
    res.status(200).json({ success: true, data: result });
  }),
);