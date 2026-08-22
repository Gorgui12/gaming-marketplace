import { Schema, model, type InferSchemaType } from 'mongoose';
import { AttributionType } from '@gm/types';

/**
 * Modèle séparé de User (§9) — permet de conserver l'historique complet des
 * tentatives d'attribution (par session, avant/après création de compte)
 * sans polluer le profil utilisateur. `consumedAt` est renseigné dès
 * qu'une conversion a utilisé cette attribution — une attribution
 * consommée reste consultable (audit) mais n'est plus éligible.
 */
const affiliateAttributionSchema = new Schema(
  {
    affiliate: { type: Schema.Types.ObjectId, ref: 'Affiliate', required: true },
    affiliateCode: { type: String, required: true },
    campaign: { type: Schema.Types.ObjectId, ref: 'AffiliateCampaign' },
    sessionId: { type: String, required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User' },
    attributionType: {
      type: String,
      enum: Object.values(AttributionType),
      default: AttributionType.AFFILIATE_LINK,
    },
    expiresAt: { type: Date, required: true },
    consumedAt: { type: Date, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

affiliateAttributionSchema.index({ sessionId: 1, expiresAt: -1 });
affiliateAttributionSchema.index({ userId: 1, expiresAt: -1 });
// Pas de TTL auto-delete ici: une attribution expirée ou consommée reste
// conservée pour l'audit (§9/§33), le nettoyage se fait par politique de
// rétention explicite si nécessaire, pas par suppression automatique.

export type AffiliateAttributionDocument = InferSchemaType<typeof affiliateAttributionSchema>;
export const AffiliateAttributionModel = model(
  'AffiliateAttribution',
  affiliateAttributionSchema,
);
