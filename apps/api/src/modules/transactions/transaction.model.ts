import { Schema, model, type InferSchemaType } from 'mongoose';
import { AccessStatus, PaymentStatus, PayoutStatus, TransactionState } from '@gm/types';

const stateHistoryEntrySchema = new Schema(
  {
    from: { type: String, required: true },
    to: { type: String, required: true },
    at: { type: Date, required: true, default: Date.now },
    actor: { type: String, required: true }, // ObjectId string ou 'SYSTEM'
  },
  { _id: false },
);

const transactionSchema = new Schema(
  {
    buyer: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    seller: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    listing: { type: Schema.Types.ObjectId, ref: 'Listing', required: true },
    amount: { type: Number, required: true, min: 0 },
    currency: { type: String, required: true },
    platformFee: { type: Number, required: true, min: 0 },
    sellerAmount: { type: Number, required: true, min: 0 },
    paymentProvider: { type: String, default: 'paydunya' },
    paymentReference: { type: String, required: true, unique: true },
    // Token PayDunya retourné à l'initiation — requis pour la vérification
    // active via invoice.confirm() si l'IPN n'arrive jamais.
    providerTransactionId: { type: String },
    paymentStatus: {
      type: String,
      enum: Object.values(PaymentStatus),
      default: PaymentStatus.PENDING,
    },
    // Statut logique du séquestre — AUCUN blocage réel de fonds côté
    // CinetPay. Voir docs/PAYMENTS.md pour le détail du choix.
    escrowStatus: {
      type: String,
      enum: Object.values(TransactionState),
      default: TransactionState.CREATED,
    },
    accessStatus: {
      type: String,
      enum: Object.values(AccessStatus),
      default: AccessStatus.NOT_RELEASED,
    },
    payoutStatus: {
      type: String,
      enum: Object.values(PayoutStatus),
      default: PayoutStatus.NOT_APPLICABLE,
    },
    buyerConfirmationAt: { type: Date },
    disputeStatus: { type: String, enum: ['none', 'open', 'resolved'], default: 'none' },
    stateHistory: { type: [stateHistoryEntrySchema], default: [] },
    attributedAffiliate: { type: Schema.Types.ObjectId, ref: 'Affiliate', default: null },
    attributionType: { type: String },
    appliedPromoCode: { type: String },
    discountAmount: { type: Number, default: 0 },
  },
  { timestamps: true },
);

// paymentReference a déjà `unique: true` inline — pas de redéclaration ici.
transactionSchema.index({ buyer: 1 });
transactionSchema.index({ seller: 1 });
transactionSchema.index({ listing: 1 });
transactionSchema.index({ escrowStatus: 1 });

export type TransactionDocument = InferSchemaType<typeof transactionSchema>;
export const TransactionModel = model('Transaction', transactionSchema);
