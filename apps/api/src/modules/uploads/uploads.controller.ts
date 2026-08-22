import type { Request, Response } from 'express';
import { asyncHandler } from '../../lib/async-handler.js';
import { AppError } from '../../lib/errors/app-error.js';
import { ErrorCode } from '../../lib/errors/error-codes.js';
import { UploadsService } from './uploads.service.js';

/**
 * Upload d'une image en corps de requête binaire brut
 * (application/octet-stream) — évite une dépendance multipart (multer)
 * alors qu'on n'uploade qu'UN fichier par requête ; le frontend chaîne
 * les uploads en parallèle pour plusieurs captures d'écran.
 */
export const uploadImage = asyncHandler(async (req: Request, res: Response) => {
  const body = Buffer.isBuffer(req.body)
    ? req.body
    : typeof req.body === 'object' && req.body !== null && 'buffer' in req.body && Buffer.isBuffer((req.body as { buffer: unknown }).buffer)
      ? (req.body as unknown as { buffer: Buffer }).buffer
      : null;

  if (!body || body.length === 0) {
    throw new AppError(
      ErrorCode.VALIDATION_ERROR,
      "Corps de requête vide — envoyer l'image en binaire (application/octet-stream)",
      400,
    );
  }

  const result = await UploadsService.uploadImage({
    buffer: body,
    contentType: req.headers['content-type'],
    folder: 'listings',
  });

  res.status(201).json({ success: true, data: result });
});
