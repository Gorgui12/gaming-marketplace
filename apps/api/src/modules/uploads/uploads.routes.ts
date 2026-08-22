import { Router, raw } from 'express';
import { requireAuth } from '../../middlewares/auth.middleware.js';
import { uploadImage } from './uploads.controller.js';

export const uploadsRouter = Router();

// Corps brut binaire : le Content-Type de la requête PORTE le mime réel
// du fichier et sert à la validation côté service — le parser doit donc
// accepter ces mimes directement (pas seulement octet-stream), sinon le
// body n'est jamais rempli. Limite légèrement au-dessus de
// MAX_IMAGE_SIZE_BYTES pour laisser passer un fichier de 5 Mo exact et
// renvoyer NOTRE erreur métier plutôt qu'un 413 générique.
uploadsRouter.post(
  '/image',
  requireAuth,
  raw({
    type: ['application/octet-stream', 'image/jpeg', 'image/png', 'image/webp'],
    limit: '6mb',
  }),
  uploadImage,
);
