import { Schema, model, type InferSchemaType } from 'mongoose';
import { ListingStatus } from '@gm/types';

const listingSchema = new Schema(
  {
    seller: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    game: { type: Schema.Types.ObjectId, ref: 'Game', required: true },
    category: { type: Schema.Types.ObjectId, ref: 'Category' },
    title: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true },
    description: { type: String, required: true },
    price: { type: Number, required: true, min: 0 },
    currency: { type: String, required: true },
    country: { type: String, required: true },
    teamStrength: { type: Number },
    playerCount: { type: Number },
    epicPlayers: { type: [String], default: [] },
    showTimePlayers: { type: [String], default: [] },
    featuredPlayers: { type: [String], default: [] },
    screenshots: { type: [String], default: [] },
    accountMetadata: { type: Schema.Types.Mixed },
    status: {
      type: String,
      enum: Object.values(ListingStatus),
      default: ListingStatus.DRAFT,
    },
    moderationStatus: {
      type: String,
      enum: ['PENDING', 'APPROVED', 'REJECTED'],
      default: 'PENDING',
    },
    moderationNotes: { type: String },
    views: { type: Number, default: 0 },
    favoritesCount: { type: Number, default: 0 },
  },
  { timestamps: true },
);

// slug a déjà `unique: true` inline sur le champ — pas de redéclaration ici.
listingSchema.index({ game: 1, status: 1, country: 1 });
listingSchema.index({ seller: 1 });

export type ListingDocument = InferSchemaType<typeof listingSchema>;
export const ListingModel = model('Listing', listingSchema);
