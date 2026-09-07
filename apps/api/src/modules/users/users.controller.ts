import type { Request, Response } from 'express';
import { updateProfileSchema } from '@gm/validation';
import { asyncHandler } from '../../lib/async-handler.js';
import { AppError } from '../../lib/errors/app-error.js';
import { ErrorCode } from '../../lib/errors/error-codes.js';
import { UserModel } from './user.model.js';

// Jamais d'email, de téléphone ni de données sensibles dans le profil
// public d'un tiers — mais ces champs sont évidemment visibles pour le
// propriétaire du compte sur /me.
const PUBLIC_PROFILE_SELECT =
  'username firstName avatar country reputation transactionCount successfulSales sellerStatus createdAt';

export const getPublicProfile = asyncHandler(async (req: Request, res: Response) => {
  const user = await UserModel.findOne({ username: req.params.username!.toLowerCase() }).select(
    PUBLIC_PROFILE_SELECT,
  );
  if (!user) {
    throw AppError.notFound(ErrorCode.NOT_FOUND, 'Utilisateur introuvable');
  }
  res.status(200).json({ success: true, data: { user } });
});

export const getMe = asyncHandler(async (req: Request, res: Response) => {
  const user = await UserModel.findById(req.user!.id);
  if (!user) {
    throw AppError.notFound(ErrorCode.NOT_FOUND, 'Utilisateur introuvable');
  }
  res.status(200).json({ success: true, data: { user } });
});

export const updateMe = asyncHandler(async (req: Request, res: Response) => {
  const input = updateProfileSchema.parse(req.body);
  const unset: Record<string, 1> = {};
  const set: Record<string, string> = {};

  if (input.firstName !== undefined) set.firstName = input.firstName;
  if (input.lastName !== undefined) set.lastName = input.lastName;
  if (input.country !== undefined) set.country = input.country;
  if (input.currency !== undefined) set.currency = input.currency;
  if (input.phone !== undefined) {
    if (input.phone) set.phone = input.phone;
    else unset.phone = 1;
  }
  if (input.avatar !== undefined) {
    if (input.avatar) set.avatar = input.avatar;
    else unset.avatar = 1;
  }

  const user = await UserModel.findByIdAndUpdate(
    req.user!.id,
    { $set: set, $unset: unset },
    { new: true, runValidators: true },
  );
  if (!user) {
    throw AppError.notFound(ErrorCode.NOT_FOUND, 'Utilisateur introuvable');
  }

  res.status(200).json({ success: true, data: { user } });
});