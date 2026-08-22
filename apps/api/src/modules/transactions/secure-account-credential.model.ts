import { Schema, model, type InferSchemaType } from 'mongoose';

/**
 * Collection volontairement séparée de Listing. Jamais peuplée par défaut
 * dans les requêtes de catalogue — seul SecureAccountAccessService y accède.
 * encryptedPayload est chiffré applicativement (AES-256-GCM) avant écriture,
 * jamais stocké en clair, jamais loggé.
 */
const secureAccountCredentialSchema = new Schema(
  {
    listing: { type: Schema.Types.ObjectId, ref: 'Listing', required: true },
    seller: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    encryptedPayload: { type: String, required: true, select: false },
    encryptionIv: { type: String, required: true, select: false },
    encryptionAuthTag: { type: String, required: true, select: false },
    encryptionKeyVersion: { type: Number, required: true, default: 1 },
    releasedToTransaction: { type: Schema.Types.ObjectId, ref: 'Transaction', default: null },
    releasedAt: { type: Date, default: null },
    invalidatedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

secureAccountCredentialSchema.index({ listing: 1 });
secureAccountCredentialSchema.index({ releasedToTransaction: 1 });

export type SecureAccountCredentialDocument = InferSchemaType<
  typeof secureAccountCredentialSchema
>;
export const SecureAccountCredentialModel = model(
  'SecureAccountCredential',
  secureAccountCredentialSchema,
);
