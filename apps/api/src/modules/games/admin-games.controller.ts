import type { Request, Response } from 'express';
import { createGameSchema, updateGameSchema } from '@gm/validation';
import { asyncHandler } from '../../lib/async-handler.js';
import { AppError } from '../../lib/errors/app-error.js';
import { ErrorCode } from '../../lib/errors/error-codes.js';
import { GameModel } from './game.model.js';
import { AuditService } from '../audit/audit.service.js';

export const listGamesAdmin = asyncHandler(async (_req: Request, res: Response) => {
  const games = await GameModel.find({}).sort({ createdAt: -1 });
  res.status(200).json({ success: true, data: { games } });
});

export const createGameAdmin = asyncHandler(async (req: Request, res: Response) => {
  const input = createGameSchema.parse(req.body);
  const existing = await GameModel.findOne({ slug: input.slug });
  if (existing) {
    throw new AppError(ErrorCode.CONFLICT, 'Un jeu avec ce slug existe déjà', 409);
  }
  // Toujours créé désactivé commercialement par défaut (§3) — l'admin doit
  // explicitement activer marketplaceEnabled après revue des CGU.
  const game = await GameModel.create({
    name: input.name,
    slug: input.slug,
    active: true,
    marketplaceEnabled: false,
  });

  await AuditService.log({
    actor: req.user!.id,
    action: 'admin.game_created',
    entityType: 'Game',
    entityId: String(game._id),
  });

  res.status(201).json({ success: true, data: { game } });
});

export const updateGameAdmin = asyncHandler(async (req: Request, res: Response) => {
  const input = updateGameSchema.parse(req.body);
  const game = await GameModel.findById(req.params.id);
  if (!game) {
    throw AppError.notFound(ErrorCode.NOT_FOUND, 'Jeu introuvable');
  }

  Object.assign(game, input);
  await game.save();

  // Action sensible (kill-switch commercial, §3) — toujours auditée avec
  // le détail exact de ce qui a changé.
  await AuditService.log({
    actor: req.user!.id,
    action: 'admin.game_updated',
    entityType: 'Game',
    entityId: String(game._id),
    metadata: input,
  });

  res.status(200).json({ success: true, data: { game } });
});
