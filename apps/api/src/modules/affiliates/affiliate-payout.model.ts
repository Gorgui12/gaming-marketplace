import { Schema, model, type InferSchemaType } from 'mongoose';
import { AffiliatePayoutStatus } from '@gm/types';

/**
 * §24 — Découplé de PayDunya (customer payment). Au MVP, le workflow est
 * manuel: un admin marque le payout comme PROCESSING puis PAID après avoir
 * réalisé le transfert par un canal externe (Mobile Money, virement), et
 * renseigne `reference` comme preuve. Aucun paiement n'est simulé
 * automatiquement — voir PayoutProvider pour l'abstraction future.
 */
const affiliatePayoutSchema = new Schema(
  {
    affiliate: { type: Schema.Types.ObjectId, ref: 'Affiliate', required: true },
    amount: { type: Number, required: true, min: 0 },
    currency: { type: String, required: true },
    status: {
      type: String,
      enum: Object.values(AffiliatePayoutStatus),
      default: AffiliatePayoutStatus.PENDING,
    },
    method: { type: String },
    reference: { type: String },
    processedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);

affiliatePayoutSchema.index({ affiliate: 1, status: 1 });

export type AffiliatePayoutDocument = InferSchemaType<typeof affiliatePayoutSchema>;
export const AffiliatePayoutModel = model('AffiliatePayout', affiliatePayoutSchema);
