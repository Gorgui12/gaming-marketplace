import type { Request, Response } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../lib/async-handler.js';
import { EmailService } from '../../lib/email/email.service.js';

const testEmailSchema = z.object({
  to: z.string().email('Adresse email invalide').optional(),
});

export const testEmail = asyncHandler(async (req: Request, res: Response) => {
  const input = testEmailSchema.parse(req.body ?? {});
  const result = await EmailService.testEmail(input.to);
  // Toujours 200 + success:true : le détail (ok/error) vit dans result et
  // le front admin l'affiche — un service KO n'est pas une erreur HTTP.
  res.status(200).json({ success: true, data: { result } });
});

export const getEmailStatus = asyncHandler(async (_req: Request, res: Response) => {
  const status = await EmailService.getStatus();
  res.status(200).json({ success: true, data: { status } });
});