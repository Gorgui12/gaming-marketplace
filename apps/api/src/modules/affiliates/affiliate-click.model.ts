import { Schema, model, type InferSchemaType } from 'mongoose';

/**
 * §5 / §30 — minimisation des données: pas d'IP brute stockée, uniquement
 * un hash (voir ip-hash.ts) utile pour l'anti-fraude (débit de clics
 * suspect) sans conserver de donnée personnelle directement identifiante.
 * TTL possible ultérieurement si la rétention doit être limitée dans le
 * temps (à documenter dans AFFILIATE.md).
 */
const affiliateClickSchema = new Schema(
  {
    affiliate: { type: Schema.Types.ObjectId, ref: 'Affiliate', required: true },
    affiliateCode: { type: String, required: true },
    campaign: { type: Schema.Types.ObjectId, ref: 'AffiliateCampaign' },
    landingPage: { type: String, required: true },
    referrer: { type: String },
    utmSource: { type: String },
    utmMedium: { type: String },
    utmCampaign: { type: String },
    deviceType: { type: String },
    country: { type: String },
    sessionId: { type: String, required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User' },
    ipHash: { type: String },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

affiliateClickSchema.index({ affiliate: 1, createdAt: -1 });
affiliateClickSchema.index({ sessionId: 1 });
affiliateClickSchema.index({ campaign: 1 });

export type AffiliateClickDocument = InferSchemaType<typeof affiliateClickSchema>;
export const AffiliateClickModel = model('AffiliateClick', affiliateClickSchema);
