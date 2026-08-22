import { Schema, model, type InferSchemaType } from 'mongoose';
import { AffiliateStatus, CommissionType, FraudReviewStatus } from '@gm/types';

const affiliateSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    affiliateCode: { type: String, required: true, unique: true, uppercase: true, trim: true },
    displayName: { type: String, required: true },
    description: { type: String },
    status: {
      type: String,
      enum: Object.values(AffiliateStatus),
      default: AffiliateStatus.PENDING,
    },
    tier: { type: Schema.Types.ObjectId, ref: 'AffiliateTier' },
    // Un taux custom sur l'affilié prime toujours sur le taux par défaut du
    // tier — utile pour les partenariats négociés individuellement (§19:
    // AMBASSADOR → custom).
    commissionRate: { type: Number, required: true, min: 0, max: 1 },
    commissionType: {
      type: String,
      enum: Object.values(CommissionType),
      default: CommissionType.PERCENTAGE,
    },
    cookieDurationDays: { type: Number, default: 30 },
    totalClicks: { type: Number, default: 0 },
    totalConversions: { type: Number, default: 0 },
    totalRevenue: { type: Number, default: 0 },
    totalCommission: { type: Number, default: 0 },
    availableCommission: { type: Number, default: 0 },
    pendingCommission: { type: Number, default: 0 },
    payoutThreshold: { type: Number, default: 10_000 },
    fraudReviewStatus: {
      type: String,
      enum: Object.values(FraudReviewStatus),
      default: FraudReviewStatus.NORMAL,
    },
  },
  { timestamps: true },
);

// user et affiliateCode ont déjà `unique: true` inline sur le champ, qui
// crée l'index automatiquement — pas de redéclaration ici (évite le
// warning Mongoose "Duplicate schema index").
affiliateSchema.index({ status: 1 });

export type AffiliateDocument = InferSchemaType<typeof affiliateSchema>;
export const AffiliateModel = model('Affiliate', affiliateSchema);
