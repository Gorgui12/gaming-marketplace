import { Schema, model, type InferSchemaType } from 'mongoose';

const affiliateCampaignSchema = new Schema(
  {
    name: { type: String, required: true },
    affiliate: { type: Schema.Types.ObjectId, ref: 'Affiliate', required: true },
    utmSource: { type: String },
    utmMedium: { type: String },
    utmCampaign: { type: String },
    startDate: { type: Date },
    endDate: { type: Date },
    status: { type: String, enum: ['ACTIVE', 'PAUSED', 'ENDED'], default: 'ACTIVE' },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

affiliateCampaignSchema.index({ affiliate: 1 });

export type AffiliateCampaignDocument = InferSchemaType<typeof affiliateCampaignSchema>;
export const AffiliateCampaignModel = model('AffiliateCampaign', affiliateCampaignSchema);
