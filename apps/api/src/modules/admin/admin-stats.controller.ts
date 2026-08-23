import type { Request, Response } from 'express';
import { asyncHandler } from '../../lib/async-handler.js';
import { AdminStatsService } from './admin-stats.service.js';

export const getAdminStats = asyncHandler(async (_req: Request, res: Response) => {
  const stats = await AdminStatsService.get();
  res.status(200).json({ success: true, data: stats });
});
