import { Router } from 'express';
import type { Request, Response } from 'express';
import { asyncHandler } from '../../lib/async-handler.js';
import { AppError } from '../../lib/errors/app-error.js';
import { ErrorCode } from '../../lib/errors/error-codes.js';
import { UserModel } from './user.model.js';

export const usersRouter = Router();

// Profil public minimal — jamais d'email, de téléphone ni de données
// sensibles. Utilisé par la page /seller/[username].
usersRouter.get(
  '/:username',
  asyncHandler(async (req: Request, res: Response) => {
    const user = await UserModel.findOne({ username: req.params.username!.toLowerCase() }).select(
      'username firstName avatar country reputation transactionCount successfulSales sellerStatus createdAt',
    );
    if (!user) {
      throw AppError.notFound(ErrorCode.NOT_FOUND, 'Utilisateur introuvable');
    }
    res.status(200).json({ success: true, data: { user } });
  }),
);
