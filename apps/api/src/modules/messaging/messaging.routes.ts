import { Router } from 'express';
import type { Request, Response } from 'express';
import { sendMessageSchema } from '@gm/validation';
import { asyncHandler } from '../../lib/async-handler.js';
import { requireAuth } from '../../middlewares/auth.middleware.js';
import { MessagingService } from './messaging.service.js';

export const messagingRouter = Router();

messagingRouter.use(requireAuth);

messagingRouter.get(
  '/:transactionId/messages',
  asyncHandler(async (req: Request, res: Response) => {
    const messages = await MessagingService.listMessages(req.params.transactionId!, req.user!.id);
    res.status(200).json({ success: true, data: { messages } });
  }),
);

messagingRouter.post(
  '/:transactionId/messages',
  asyncHandler(async (req: Request, res: Response) => {
    const input = sendMessageSchema.parse(req.body);
    const message = await MessagingService.sendMessage({
      transactionId: req.params.transactionId!,
      senderId: req.user!.id,
      content: input.content,
    });
    res.status(201).json({ success: true, data: { message } });
  }),
);
