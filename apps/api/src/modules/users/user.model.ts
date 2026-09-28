import { Schema, model, type InferSchemaType } from 'mongoose';
import { UserRole, UserAccountStatus } from '@gm/types';

const userSchema = new Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    phone: { type: String, trim: true },
    passwordHash: { type: String, select: false },
    googleId: { type: String, unique: true, sparse: true, select: false },
    passwordResetToken: { type: String, select: false },
    passwordResetExpires: { type: Date, select: false },
    emailVerifyToken: { type: String, select: false },
    emailVerifyExpires: { type: Date, select: false },
    // Date du dernier envoi du lien, utilisée pour imposer un délai entre deux
    // renvois. `emailVerifyExpires` ne peut pas jouer ce rôle : c'est la
    // date d'expiration du token (24 h), pas l'heure d'envoi.
    emailVerifySentAt: { type: Date, select: false },
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
    // Consentement aux emails commerciaux (newsletter).
    //
    // Regroupé dans un sous-objet plutôt qu'un booléen isolé parce qu'on a
    // besoin de trois informations distinctes : l'état, la date du
    // consentement (c'est la preuve qu'il faut pouvoir dater en cas de
    // réclamation) et le token de désinscription.
    //
    // `unsubscribeToken` est `select: false` : /users/me renvoie le document
    // utilisateur entier, un champ ordinaire exposerait donc ce token dans le
    // JSON de l'API. `select: false` ne joue que sur les requêtes, pas sur le
    // document renvoyé par `create()` — mais le contrôleur d'inscription
    // sérialise champ par champ, donc aucun chemin ne l'expose.
    //
    // Le token est écrit à l'opt-in uniquement : à l'inscription quand la case
    // a été cochée, sinon à la première activation depuis Mon profil. Un compte
    // créé sans consentement n'a donc jamais eu de token, ce qui évite d'avoir
    // à en révoquer un.
    //
    // ATTENTION : l'inscription via Google (auth.controller -> AuthService)
    // ne passe pas par le formulaire web et ne doit PAS consentir à la
    // place de l'utilisateur. Le défaut `false` le garantit ; c'est
    // volontaire, pas un oubli.
    marketing: {
      optedIn: { type: Boolean, default: false },
      updatedAt: { type: Date, default: null },
      unsubscribeToken: { type: String, default: null, select: false },
    },
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
    // Incrémenté à chaque changement de statut ou de rôle. Le token de
    // session embarque la valeur lue à l'émission ; si elle ne correspond
    // plus à celle en base, le cookie est considéré comme révoqué. C'est ce
    // qui rend un bannissement ou une rétrogradation immédiatement effectif
    // malgré un token stateless (sinon le cookie resterait valable
    // SESSION_TTL_DAYS).
    sessionVersion: { type: Number, default: 0 },
    referredByAffiliate: { type: Schema.Types.ObjectId, ref: 'Affiliate', default: null },
  },
  { timestamps: true },
);

// email et username ont déjà `unique: true` inline sur le champ, qui crée
// l'index automatiquement — pas besoin de le redéclarer ici (évite le
// warning Mongoose "Duplicate schema index").

// Index du token de désinscription : la route publique
// GET/POST /api/v1/unsubscribe/:token ne doit pas faire un COLLSCAN sur
// `users` à chaque clic. `sparse` car la quasi-totalité des comptes n'en a
// pas (le champ n'est rempli qu'à l'opt-in) : l'index ne contient donc que
// les comptes réellement inscrits à la newsletter.
userSchema.index({ 'marketing.unsubscribeToken': 1 }, { sparse: true });

export type UserDocument = InferSchemaType<typeof userSchema>;
export const UserModel = model('User', userSchema);
