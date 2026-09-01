import { Schema, model, type InferSchemaType } from 'mongoose';

const conversationSchema = new Schema(
  {
    transaction: { type: Schema.Types.ObjectId, ref: 'Transaction', required: true, unique: true },
    participants: [{ type: Schema.Types.ObjectId, ref: 'User', required: true }],
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

export type ConversationDocument = InferSchemaType<typeof conversationSchema>;
export const ConversationModel = model('Conversation', conversationSchema);
