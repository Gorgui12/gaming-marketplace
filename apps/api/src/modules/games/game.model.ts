import { Schema, model, type InferSchemaType } from 'mongoose';
import { GameTermsStatus } from '@gm/types';

const gameSchema = new Schema(
  {
    name: { type: String, required: true },
    slug: { type: String, required: true, unique: true, lowercase: true },
    active: { type: Boolean, default: true },
    // Kill-switch commercial: si false, aucune nouvelle transaction ne peut
    // être initiée sur ce jeu, quel que soit le statut des annonces.
    marketplaceEnabled: { type: Boolean, default: false },
    termsStatus: {
      type: String,
      enum: Object.values(GameTermsStatus),
      default: GameTermsStatus.UNREVIEWED,
    },
    termsNotes: { type: String },
  },
  { timestamps: true },
);

export type GameDocument = InferSchemaType<typeof gameSchema>;
export const GameModel = model('Game', gameSchema);
