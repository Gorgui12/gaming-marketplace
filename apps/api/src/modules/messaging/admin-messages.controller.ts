import type { Request, Response } from 'express';
import { asyncHandler } from '../../lib/async-handler.js';
import { MessagingService } from './messaging.service.js';

export const listBlockedMessages = asyncHandler(async (_req: Request, res: Response) => {
  const messages = await MessagingService.listBlockedForAdmin();
  res.status(200).json({ success: true, data: { messages } });
});