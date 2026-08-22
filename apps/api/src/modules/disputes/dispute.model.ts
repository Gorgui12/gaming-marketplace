import { Schema, model, type InferSchemaType } from 'mongoose';
import { DisputeStatus } from '@gm/types';

const evidenceSchema = new Schema(
  {
    type: { type: String, enum: ['image', 'text', 'file'], required: true },
    url: { type: String },
    content: { type: String },
    uploadedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    uploadedAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

const disputeSchema = new Schema(
  {
    transaction: { type: Schema.Types.ObjectId, ref: 'Transaction', required: true },
    openedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    reason: { type: String, required: true },
    description: { type: String, required: true },
    evidence: { type: [evidenceSchema], default: [] },
    status: {
      type: String,
      enum: Object.values(DisputeStatus),
      default: DisputeStatus.OPEN,
    },
    assignedAdmin: { type: Schema.Types.ObjectId, ref: 'User' },
    resolution: { type: String },
    resolvedAt: { type: Date },
  },
  { timestamps: true },
);

disputeSchema.index({ transaction: 1 });
disputeSchema.index({ status: 1 });

export type DisputeDocument = InferSchemaType<typeof disputeSchema>;
export const DisputeModel = model('Dispute', disputeSchema);
