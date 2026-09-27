import type { Request, Response } from 'express';
import { Router } from 'express';
import { openDisputeSchema } from '@gm/validation';
import { asyncHandler } from '../../lib/async-handler.js';
import { requireAuth } from '../../middlewares/auth.middleware.js';
import { disputeRateLimiter } from '../../middlewares/rate-limit.middleware.js';
import { DisputesService } from './disputes.service.js';

export const openDispute = asyncHandler(async (req: Request, res: Response) => {
  const input = openDisputeSchema.parse(req.body);
  const dispute = await DisputesService.open({ ...input, userId: req.user!.id });
  res.status(201).json({ success: true, data: { dispute } });
});

/**
 * Litiges de l'utilisateur : ceux qu'il a ouverts et ceux ouverts sur une de
 * ses transactions (le vendeur n'ouvre pas de litige mais doit pouvoir suivre
 * le dossier ouvert par l'acheteur et comprendre la décision).
 *
 * Indispensable : sans cet endpoint, l'UI ne peut pas afficher l'état d'un
 * litige ni la motivation de sa résolution.
 */
export const listMyDisputes = asyncHandler(async (req: Request, res: Response) => {
  const disputes = await DisputesService.listForUser(req.user!.id);
  res.status(200).json({ success: true, data: { disputes } });
});

export const disputesRouter = Router();
disputesRouter.use(requireAuth);
disputesRouter.get('/mine', listMyDisputes);
// Limiteur dédié : ouvrir un litige est une action à effet de bord (gèle le
// séquestre et déclenche des notifications). Le quota global autorise trop de
// appels pour qu'un client automatisé ne noie pas les boîtes mail.
disputesRouter.post('/', disputeRateLimiter, openDispute);
