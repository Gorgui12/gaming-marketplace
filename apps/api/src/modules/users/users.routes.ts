import { Router } from 'express';
import { requireAuth } from '../../middlewares/auth.middleware.js';
import { getMe, getPublicProfile, updateMe } from './users.controller.js';

export const usersRouter = Router();

// Profil de l'utilisateur connecté — déclaré avant /:username pour ne pas
// être capturé par le paramètre dynamic.
usersRouter.get('/me', requireAuth, getMe);
usersRouter.patch('/me', requireAuth, updateMe);

// Profil public minimal — jamais d'email, de téléphone ni de données
// sensibles. Utilisé par la page /seller/[username].
usersRouter.get('/:username', getPublicProfile);