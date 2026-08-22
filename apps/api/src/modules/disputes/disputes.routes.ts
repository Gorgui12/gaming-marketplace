import type { Request, Response } from 'express';
import { Router } from 'express';
import { openDisputeSchema } from '@gm/validation';
import { asyncHandler } from '../../lib/async-handler.js';
import { requireAuth } from '../../middlewares/auth.middleware.js';
import { DisputesService } from './disputes.service.js';

export const openDispute = asyncHandler(async (req: Request, res: Response) => {
  const input = openDisputeSchema.parse(req.body);
  const dispute = await DisputesService.open({ ...input, userId: req.user!.id });
  res.status(201).json({ success: true, data: { dispute } });
});

export const disputesRouter = Router();
disputesRouter.use(requireAuth);
disputesRouter.post('/', openDispute);
