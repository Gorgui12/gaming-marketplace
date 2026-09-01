import { Router } from 'express';
import type { Request, Response } from 'express';
import { createReviewSchema } from '@gm/validation';
import { asyncHandler } from '../../lib/async-handler.js';
import { requireAuth } from '../../middlewares/auth.middleware.js';
import { ReviewsService } from './reviews.service.js';

export const reviewsRouter = Router();

// Écriture — nécessite d'être partie prenante de la transaction COMPLETED.
reviewsRouter.post(
  '/',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const input = createReviewSchema.parse(req.body);
    const review = await ReviewsService.create({
      transactionId: input.transactionId,
      authorId: req.user!.id,
      rating: input.rating,
      comment: input.comment,
    });
    res.status(201).json({ success: true, data: { review } });
  }),
);

reviewsRouter.get(
  '/mine',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const reviews = await ReviewsService.listMine(req.user!.id);
    res.status(200).json({ success: true, data: { reviews } });
  }),
);

// Lecture publique — avis reçus par un utilisateur (page profil vendeur).
reviewsRouter.get(
  '/user/:userId',
  asyncHandler(async (req: Request, res: Response) => {
    const reviews = await ReviewsService.listForUser(req.params.userId!);
    res.status(200).json({ success: true, data: { reviews } });
  }),
);
