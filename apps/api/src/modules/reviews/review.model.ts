import { Schema, model, type InferSchemaType } from 'mongoose';

const reviewSchema = new Schema(
  {
    transaction: { type: Schema.Types.ObjectId, ref: 'Transaction', required: true },
    author: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    target: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    rating: { type: Number, required: true, min: 1, max: 5 },
    comment: { type: String, maxlength: 1000 },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

// Un seul avis par (transaction, auteur) — empêche un même acheteur/vendeur
// de laisser plusieurs avis sur la même transaction. Contrainte
// structurelle (index unique), pas seulement applicative.
reviewSchema.index({ transaction: 1, author: 1 }, { unique: true });
reviewSchema.index({ target: 1, createdAt: -1 });

export type ReviewDocument = InferSchemaType<typeof reviewSchema>;
export const ReviewModel = model('Review', reviewSchema);
