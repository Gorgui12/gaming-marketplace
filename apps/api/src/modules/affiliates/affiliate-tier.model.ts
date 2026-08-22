import { Schema, model, type InferSchemaType } from 'mongoose';

/**
 * Programme à plusieurs niveaux (§19). Les taux ne sont jamais hardcodés
 * dans le code métier — toujours résolus via ce modèle (ou un taux custom
 * sur l'Affiliate lui-même qui prime sur le tier, voir affiliate.model.ts).
 */
const affiliateTierSchema = new Schema(
  {
    name: { type: String, required: true },
    slug: { type: String, required: true, unique: true },
    defaultCommissionRate: { type: Number, required: true, min: 0, max: 1 },
    minConversionsToUpgrade: { type: Number },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

export type AffiliateTierDocument = InferSchemaType<typeof affiliateTierSchema>;
export const AffiliateTierModel = model('AffiliateTier', affiliateTierSchema);
