import { Schema, model, type InferSchemaType } from 'mongoose';
import { DiscountType } from '@gm/types';

const promoCodeSchema = new Schema(
  {
    code: { type: String, required: true, unique: true, uppercase: true, trim: true },
    affiliate: { type: Schema.Types.ObjectId, ref: 'Affiliate' },
    campaign: { type: Schema.Types.ObjectId, ref: 'AffiliateCampaign' },
    discountType: { type: String, enum: Object.values(DiscountType), required: true },
    discountValue: { type: Number, required: true, min: 0 },
    minimumOrderAmount: { type: Number },
    maximumDiscount: { type: Number },
    usageLimit: { type: Number },
    usagePerUser: { type: Number, default: 1 },
    usedCount: { type: Number, default: 0 },
    startDate: { type: Date },
    endDate: { type: Date },
    active: { type: Boolean, default: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

// code a déjà `unique: true` inline sur le champ — pas de redéclaration ici.
promoCodeSchema.index({ affiliate: 1 });

export type PromoCodeDocument = InferSchemaType<typeof promoCodeSchema>;
export const PromoCodeModel = model('PromoCode', promoCodeSchema);
