import { Router } from 'express';
import type { Request, Response } from 'express';
import { asyncHandler } from '../../lib/async-handler.js';
import { requireAuth } from '../../middlewares/auth.middleware.js';
import { NotificationService } from './notification.service.js';

export const notificationsRouter = Router();

notificationsRouter.use(requireAuth);

notificationsRouter.get(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const [notifications, unreadCount] = await Promise.all([
      NotificationService.listMine(req.user!.id),
      NotificationService.countUnread(req.user!.id),
    ]);
    res.status(200).json({ success: true, data: { notifications, unreadCount } });
  }),
);

notificationsRouter.post(
  '/:id/read',
  asyncHandler(async (req: Request, res: Response) => {
    await NotificationService.markRead(req.params.id!, req.user!.id);
    res.status(200).json({ success: true, data: null });
  }),
);

notificationsRouter.post(
  '/read-all',
  asyncHandler(async (req: Request, res: Response) => {
    await NotificationService.markAllRead(req.user!.id);
    res.status(200).json({ success: true, data: null });
  }),
);
