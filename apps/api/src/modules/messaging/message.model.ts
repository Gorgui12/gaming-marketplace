import { Schema, model, type InferSchemaType } from 'mongoose';

const messageSchema = new Schema(
  {
    conversation: { type: Schema.Types.ObjectId, ref: 'Conversation', required: true },
    sender: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    content: { type: String, required: true, maxlength: 2000 },
    // §15 — détection de tentative de contournement de la plateforme
    // (numéro de téléphone, email, lien externe). Un message flaggé est
    // BLOQUÉ : il n'est jamais affiché dans la conversation et l'équipe
    // est notifiée — voir messaging.service.ts + /admin/messages/blocked.
    flaggedForContactInfo: { type: Boolean, default: false },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

messageSchema.index({ conversation: 1, createdAt: 1 });

export type MessageDocument = InferSchemaType<typeof messageSchema>;
export const MessageModel = model('Message', messageSchema);
