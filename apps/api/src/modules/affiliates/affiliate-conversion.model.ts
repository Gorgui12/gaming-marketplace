import { Schema, model, type InferSchemaType } from 'mongoose';
import { AttributionType, CommissionBase, CommissionStatus, FraudReviewStatus } from '@gm/types';

const affiliateConversionSchema = new Schema(
  {
    affiliate: { type: Schema.Types.ObjectId, ref: 'Affiliate', required: true },
    // Contrainte d'unicité logique demandée en §31: affiliate + transaction.
    // On force l'unicité sur `transaction` seule, ce qui est STRICTEMENT
    // plus fort (une transaction ne peut jamais avoir deux conversions,
    // peu importe l'affilié) — empêche toute double commission par
    // construction, pas seulement par vérification applicative.
    transaction: { type: Schema.Types.ObjectId, ref: 'Transaction', required: true, unique: true },
    buyer: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    orderAmount: { type: Number, required: true },
    discountAmount: { type: Number, default: 0 },
    commissionBase: {
      type: String,
      enum: Object.values(CommissionBase),
      required: true,
    },
    commissionRate: { type: Number, required: true },
    commissionAmount: { type: Number, required: true },
    attributionType: { type: String, enum: Object.values(AttributionType), required: true },
    promoCode: { type: String },
    status: {
      type: String,
      enum: Object.values(CommissionStatus),
      default: CommissionStatus.PENDING,
    },
    fraudReviewStatus: {
      type: String,
      enum: Object.values(FraudReviewStatus),
      default: FraudReviewStatus.NORMAL,
    },
    clearanceDueAt: { type: Date },
  },
  { timestamps: true },
);

// transaction a déjà `unique: true` inline — garantie anti-double-commission.
affiliateConversionSchema.index({ affiliate: 1, status: 1 });

export type AffiliateConversionDocument = InferSchemaType<typeof affiliateConversionSchema>;
export const AffiliateConversionModel = model('AffiliateConversion', affiliateConversionSchema);
