import { v2 as cloudinary, type UploadApiResponse } from 'cloudinary';
import { env } from '../../config/env.js';
import { AppError } from '../../lib/errors/app-error.js';
import { ErrorCode } from '../../lib/errors/error-codes.js';
import { logger } from '../../lib/logger.js';

// Formats acceptés pour les captures d'écran d'annonces. Tout le reste
// (gif animé, pdf, heic...) est rejeté AVANT l'envoi à Cloudinary — on ne
// paie ni bande passante ni stockage pour du contenu non conforme.
const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
]);

export const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024; // 5 Mo

let configured = false;

function ensureConfigured(): void {
  if (configured) return;
  if (!env.STORAGE_CLOUD_NAME || !env.STORAGE_API_KEY || !env.STORAGE_API_SECRET) {
    throw new AppError(
      ErrorCode.INTERNAL_ERROR,
      "Stockage images non configuré (STORAGE_* manquants côté serveur)",
      503,
    );
  }
  cloudinary.config({
    cloud_name: env.STORAGE_CLOUD_NAME,
    api_key: env.STORAGE_API_KEY,
    api_secret: env.STORAGE_API_SECRET,
    secure: true,
  });
  configured = true;
}

export class UploadsService {
  /**
   * Upload d'une image vers Cloudinary (upload signé côté serveur — les
   * clés API ne quittent JAMAIS le backend, contrairement à un upload
   * direct depuis le navigateur avec signature générée côté client).
   * Retourne l'URL sécurisée + publicId pour une éventuelle suppression.
   */
  static async uploadImage(input: {
    buffer: Buffer;
    contentType: string | undefined;
    folder?: string;
  }): Promise<{ url: string; publicId: string; bytes: number }> {
    ensureConfigured();

    if (!input.contentType || !ALLOWED_MIME_TYPES.has(input.contentType)) {
      throw new AppError(
        ErrorCode.VALIDATION_ERROR,
        "Format d'image non supporté (JPEG, PNG ou WebP uniquement)",
        400,
      );
    }
    if (input.buffer.length === 0) {
      throw new AppError(ErrorCode.VALIDATION_ERROR, 'Fichier vide', 400);
    }
    if (input.buffer.length > MAX_IMAGE_SIZE_BYTES) {
      throw new AppError(
        ErrorCode.VALIDATION_ERROR,
        `Image trop lourde (max ${Math.floor(MAX_IMAGE_SIZE_BYTES / (1024 * 1024))} Mo)`,
        400,
      );
    }

    const result = await new Promise<UploadApiResponse>((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder: input.folder ?? 'listings',
          resource_type: 'image',
          // Les captures d'écran sont publiques par nature (vitrine de
          // l'annonce) : pas de upload_signing, mais un type 'upload'
          // classique derrière un CDN.
          unique_filename: true,
          overwrite: false,
        },
        (err, res) => {
          if (err || !res) {
            reject(err ?? new Error('Réponse Cloudinary vide'));
            return;
          }
          resolve(res);
        },
      );
      stream.end(input.buffer);
    }).catch((err: unknown) => {
      logger.error({ err }, 'Échec upload Cloudinary');
      throw new AppError(
        ErrorCode.INTERNAL_ERROR,
        "Impossible d'héberger l'image pour le moment",
        502,
      );
    });

    return { url: result.secure_url, publicId: result.public_id, bytes: result.bytes };
  }
}
