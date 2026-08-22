import { Schema, model, type InferSchemaType } from 'mongoose';
import { UserRole, UserAccountStatus } from '@gm/types';

const userSchema = new Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    phone: { type: String, trim: true },
    passwordHash: { type: String, required: true, select: false },
    firstName: { type: String, required: true, trim: true },
    lastName: { type: String, required: true, trim: true },
    username: { type: String, required: true, unique: true, lowercase: true, trim: true },
    avatar: { type: String },
    country: { type: String, required: true },
    currency: { type: String, required: true },
    roles: {
      type: [String],
      enum: Object.values(UserRole),
      default: [UserRole.USER],
    },
    emailVerified: { type: Boolean, default: false },
    phoneVerified: { type: Boolean, default: false },
    sellerStatus: {
      type: String,
      enum: ['NONE', 'PENDING', 'VERIFIED', 'REJECTED'],
      default: 'NONE',
    },
    reputation: {
      average: { type: Number, default: 0 },
      count: { type: Number, default: 0 },
    },
    transactionCount: { type: Number, default: 0 },
    successfulSales: { type: Number, default: 0 },
    successfulPurchases: { type: Number, default: 0 },
    riskScore: { type: Number, default: 0 },
    status: {
      type: String,
      enum: Object.values(UserAccountStatus),
      default: UserAccountStatus.ACTIVE,
    },
    referredByAffiliate: { type: Schema.Types.ObjectId, ref: 'Affiliate', default: null },
  },
  { timestamps: true },
);

// email et username ont déjà `unique: true` inline sur le champ, qui crée
// l'index automatiquement — pas besoin de le redéclarer ici (évite le
// warning Mongoose "Duplicate schema index").

export type UserDocument = InferSchemaType<typeof userSchema>;
export const UserModel = model('User', userSchema);
