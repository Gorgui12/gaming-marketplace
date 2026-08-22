import { Schema, model, type InferSchemaType } from 'mongoose';

const paymentEventSchema = new Schema(
  {
    transaction: { type: Schema.Types.ObjectId, ref: 'Transaction', required: true },
    provider: { type: String, required: true },
    providerEventId: { type: String, required: true, unique: true },
    rawPayload: { type: Schema.Types.Mixed },
    processed: { type: Boolean, default: false },
    processedAt: { type: Date },
  },
  { timestamps: { createdAt: 'receivedAt', updatedAt: false } },
);

// Index unique = le mécanisme d'idempotence lui-même. Un insert en double
// lève une erreur de clé dupliquée, interceptée explicitement dans le
// webhook controller pour répondre 200 sans retraiter.
// providerEventId a déjà `unique: true` inline — c'est lui le mécanisme
// d'idempotence, pas besoin de le redéclarer ici.

export type PaymentEventDocument = InferSchemaType<typeof paymentEventSchema>;
export const PaymentEventModel = model('PaymentEvent', paymentEventSchema);
