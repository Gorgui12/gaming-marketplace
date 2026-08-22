import { Router } from 'express';
import { asyncHandler } from '../../lib/async-handler.js';
import { GameModel } from './game.model.js';

export const gamesRouter = Router();

// Public: liste des jeux actifs (pas forcément marketplaceEnabled — le
// formulaire vendeur affiche le jeu mais peut désactiver la soumission si
// marketplaceEnabled est false, voir front-end).
gamesRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    const games = await GameModel.find({ active: true }).sort({ name: 1 });
    res.status(200).json({ success: true, data: { games } });
  }),
);
