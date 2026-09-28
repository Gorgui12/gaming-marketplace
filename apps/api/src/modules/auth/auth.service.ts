import crypto from 'node:crypto';
import type { HydratedDocument } from 'mongoose';
import argon2 from 'argon2';
import { OAuth2Client } from 'google-auth-library';
import { UserRole, UserAccountStatus } from '@gm/types';
import type { LoginInput, RegisterInput, ForgotPasswordInput, ResetPasswordInput, GoogleAuthInput, VerifyEmailInput, ResendVerificationInput } from '@gm/validation';
import { AppError } from '../../lib/errors/app-error.js';
import { ErrorCode } from '../../lib/errors/error-codes.js';
import { UserModel, type UserDocument } from '../users/user.model.js';
import { getCountry } from '@gm/config';
import { AuditService } from '../audit/audit.service.js';
import { AffiliateAttributionService } from '../affiliates/affiliate-attribution.service.js';
import { EmailService } from '../../lib/email/email.service.js';
import { checkEmailDomain } from '../../lib/email/email-deliverability.js';
import { buildOptInState } from '../newsletter/marketing-consent.service.js';
import { logger } from '../../lib/logger.js';
import { env } from '../../config/env.js';

const googleClient = env.GOOGLE_CLIENT_ID ? new OAuth2Client(env.GOOGLE_CLIENT_ID) : null;

/** Durée de validité du lien de confirmation. */
const EMAIL_VERIFY_TTL_MS = 24 * 60 * 60 * 1000;

/** Délai minimum entre deux envois pour un même compte. */
const EMAIL_VERIFY_RESEND_COOLDOWN_MS = 60 * 1000;

/**
 * Projection nécessaire pour lire ET réécrire le token de confirmation.
 * Ces champs sont `select: false` : sans ce `+`, ils sont absents du document
 * et `save()` ne persiste pas le nouveau token.
 */
const EMAIL_VERIFY_FIELDS = '+emailVerifyToken +emailVerifyExpires +emailVerifySentAt';

export class AuthService {
  static async register(input: RegisterInput) {
    const existing = await UserModel.findOne({
      $or: [{ email: input.email }, { username: input.username }],
    });
    if (existing) {
      throw new AppError(
        ErrorCode.USER_ALREADY_EXISTS,
        'Un compte existe déjà avec cet email ou ce nom d\'utilisateur',
        409,
      );
    }

    const country = getCountry(input.country);
    if (!country) {
      throw new AppError(ErrorCode.VALIDATION_ERROR, 'Pays non supporté', 400);
    }

    // Dernier rempart contre les adresses qui n'existent pas : le schéma a
    // déjà écarté les formats invalides, les TLD réservés et les domaines
    // jetables. Ici on interroge le DNS pour vérifier que le domaine peut
    // réellement recevoir du courrier. Un DNS indisponible laisse passer
    // (voir email-deliverability.ts) : mieux vaut un compte à confirmer
    // qu'un client privé de compte par une panne de resolver.
    const domain = input.email.slice(input.email.lastIndexOf('@') + 1);
    const verdict = await checkEmailDomain(domain);
    if (verdict === 'undeliverable') {
      throw new AppError(
        ErrorCode.EMAIL_NOT_DELIVERABLE,
        "Ce domaine ne peut pas recevoir d'email. Vérifiez l'adresse saisie.",
        400,
      );
    }

    const passwordHash = await argon2.hash(input.password);

    const user = await UserModel.create({
      email: input.email,
      phone: input.phone,
      passwordHash,
      firstName: input.firstName,
      lastName: input.lastName,
      username: input.username,
      country: country.code,
      currency: country.currency,
      roles: [UserRole.USER],
      // Consentement marketing demandé explicitement dans le formulaire.
      // Le token n'est écrit que si la case a été cochée — voir
      // MarketingConsentService.
      marketing: buildOptInState(input.marketingOptIn),
    });

    if (input.marketingOptIn) {
      await AuditService.log({
        actor: String(user._id),
        action: 'user.marketing_opted_in',
        entityType: 'User',
        entityId: String(user._id),
        metadata: { source: 'register' },
      });
    }

    await AuditService.log({
      actor: String(user._id),
      action: 'user.registered',
      entityType: 'User',
      entityId: String(user._id),
    });

    if (input.sessionId) {
      await AffiliateAttributionService.attachSessionToUser(input.sessionId, String(user._id));
    }

    await this.issueEmailVerification(user);

    return user;
  }

  /**
   * (Ré)émet un lien de confirmation et l'envoie au compte.
   *
   * Partagé entre l'inscription et le renvoi manuel : un seul endroit où le
   * token est généré, haché, daté et mis en expiration.
   *
   * L'envoi reste en fire-and-forget : un email de confirmation est un
   * confort, pas une condition de réussite de l'inscription. Un échec doit
   * être journalisé, pas remonter à l'appelant — l'utilisateur a de toute
   * façon la page /verify-email pour réclamer un nouveau lien.
   */
  private static async issueEmailVerification(
    user: HydratedDocument<UserDocument>,
  ): Promise<void> {
    const token = crypto.randomBytes(32).toString('hex');
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');
    user.emailVerifyToken = hashedToken;
    user.emailVerifyExpires = new Date(Date.now() + EMAIL_VERIFY_TTL_MS);
    user.emailVerifySentAt = new Date();
    await user.save();

    const verifyUrl = `${env.APP_URL}/verify-email?token=${token}`;
    EmailService.sendEmailVerification(user.email, user.firstName, verifyUrl).catch((err) => {
      logger.error({ err, email: user.email }, 'Échec envoi email de confirmation');
    });
  }

  /**
   * Renvoie le lien de confirmation à un compte dont l'email n'a pas été
   * validé. Sans cette route, un email tombé en courrier indésirable — cas
   * très fréquent, en particulier sur iPhone — condamnait le compte à vie,
   * désormais que les actions engageantes sont bloquées.
   *
   * Le compte est identifié par la session quand elle existe (cas courant :
   * l'utilisateur vient de s'inscrire ou de se connecter) et par l'email
   * sinon. Les deux chemins renvoient une réponse identique, sans jamais
   * révéler si l'email correspond à un compte ni si la boîte est déjà
   * validée — sinon on permettrait d'énumérer les inscrits et de repérer ceux
   * dont l'email « fuit ».
   */
  static async resendVerification(input: ResendVerificationInput, userId?: string): Promise<void> {
    if (!userId && !input.email) {
      throw new AppError(ErrorCode.VALIDATION_ERROR, 'Email manquant', 400);
    }

    const user = userId
      ? await UserModel.findById(userId).select(EMAIL_VERIFY_FIELDS)
      : await UserModel.findOne({ email: input.email!.toLowerCase() }).select(
          EMAIL_VERIFY_FIELDS,
        );

    if (!user) return;
    if (user.status !== UserAccountStatus.ACTIVE) return;
    // Déjà confirmé : renvoyer un lien n'aurait aucun sens et laisserait
    // croire qu'il reste une action à faire.
    if (user.emailVerified) return;

    // Anti-spam : le rate limiter de la route (3 req / 15 min) limite
    // l'origine, mais pas assez pour empêcher de marteler une boîte réelle.
    // Une minute d'attente ne gêne pas le cas légitime « mon email est en
    // spam », qui est précisément celui qu'on cherche à servir.
    const lastSentAt = user.emailVerifySentAt;
    if (lastSentAt && Date.now() - lastSentAt.getTime() < EMAIL_VERIFY_RESEND_COOLDOWN_MS) {
      return;
    }

    await this.issueEmailVerification(user);
  }

  static async login(input: LoginInput) {
    const user = await UserModel.findOne({ email: input.email }).select('+passwordHash');
    if (!user) {
      throw new AppError(ErrorCode.INVALID_CREDENTIALS, 'Identifiants invalides', 401);
    }

    if (!user.passwordHash) {
      throw new AppError(
        ErrorCode.INVALID_CREDENTIALS,
        'Ce compte utilise la connexion Google. Veuillez vous connecter avec Google.',
        401,
      );
    }

    const valid = await argon2.verify(user.passwordHash, input.password);
    if (!valid) {
      throw new AppError(ErrorCode.INVALID_CREDENTIALS, 'Identifiants invalides', 401);
    }

    // Le mot de passe est correct, mais le compte est suspendu/banni : on ne
    // délivre pas de session. Sans ce contrôle, un bannissement était
    // contournable en une simple requête de login.
    if (user.status !== UserAccountStatus.ACTIVE) {
      throw new AppError(
        ErrorCode.FORBIDDEN,
        user.status === UserAccountStatus.BANNED
          ? 'Ce compte a été banni. Contactez le support.'
          : 'Ce compte est suspendu. Contactez le support.',
        403,
      );
    }

    await AuditService.log({
      actor: String(user._id),
      action: 'user.login',
      entityType: 'User',
      entityId: String(user._id),
    });

    return user;
  }

  static async forgotPassword(input: ForgotPasswordInput) {
    const user = await UserModel.findOne({ email: input.email }).select('+passwordHash');
    if (!user) {
      // Ne pas révéler si l'email existe ou non (sécurité)
      return;
    }

    // Ne permettre la réinitialisation que pour les comptes avec mot de passe
    if (!user.passwordHash) {
      return;
    }

    const token = crypto.randomBytes(32).toString('hex');
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

    user.passwordResetToken = hashedToken;
    user.passwordResetExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 heure
    await user.save();

    const resetUrl = `${env.APP_URL}/reset-password?token=${token}`;

    EmailService.sendPasswordReset(user.email, user.firstName, resetUrl).catch((err) => {
      logger.error({ err, email: user.email }, 'Échec envoi email reset password');
    });
  }

  static async resetPassword(input: ResetPasswordInput) {
    const hashedToken = crypto.createHash('sha256').update(input.token).digest('hex');

    const user = await UserModel.findOne({
      passwordResetToken: hashedToken,
      passwordResetExpires: { $gt: new Date() },
    }).select('+passwordResetToken +passwordResetExpires');

    if (!user) {
      throw new AppError(ErrorCode.VALIDATION_ERROR, 'Token invalide ou expiré', 400);
    }

    user.passwordHash = await argon2.hash(input.password);
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;
    await user.save();

    await AuditService.log({
      actor: String(user._id),
      action: 'user.password_reset',
      entityType: 'User',
      entityId: String(user._id),
    });

    return user;
  }

  static async verifyEmail(input: VerifyEmailInput) {
    const hashedToken = crypto.createHash('sha256').update(input.token).digest('hex');

    const user = await UserModel.findOne({
      emailVerifyToken: hashedToken,
      emailVerifyExpires: { $gt: new Date() },
    }).select('+emailVerifyToken +emailVerifyExpires');

    if (!user) {
      throw new AppError(
        ErrorCode.VALIDATION_ERROR,
        "Lien de confirmation invalide ou expiré. Veuillez demander un nouvel email de confirmation.",
        400,
      );
    }

    if (user.emailVerified) {
      user.emailVerifyToken = undefined;
      user.emailVerifyExpires = undefined;
      await user.save();
      return user;
    }

    user.emailVerified = true;
    user.emailVerifyToken = undefined;
    user.emailVerifyExpires = undefined;
    await user.save();

    await AuditService.log({
      actor: String(user._id),
      action: 'user.email_verified',
      entityType: 'User',
      entityId: String(user._id),
    });

    return user;
  }

  static async googleAuth(input: GoogleAuthInput) {
    if (!googleClient) {
      throw new AppError(
        ErrorCode.VALIDATION_ERROR,
        'La connexion Google n\'est pas configurée',
        501,
      );
    }

    let payload;
    try {
      const ticket = await googleClient.verifyIdToken({
        idToken: input.idToken,
        audience: env.GOOGLE_CLIENT_ID,
      });
      payload = ticket.getPayload();
    } catch {
      throw new AppError(ErrorCode.INVALID_CREDENTIALS, 'Token Google invalide', 401);
    }

    if (!payload?.email) {
      throw new AppError(ErrorCode.INVALID_CREDENTIALS, 'Impossible de récupérer l\'email Google', 401);
    }
    if (payload.email_verified === false) {
      // Google indique explicitement que cet email n'est pas vérifié —
      // ne jamais faire confiance à un email non vérifié pour lier ou
      // créer un compte (évite un usurpation d'email théorique).
      throw new AppError(
        ErrorCode.INVALID_CREDENTIALS,
        "L'email de ce compte Google n'est pas vérifié",
        401,
      );
    }

    const googleId = payload.sub;
    const email = payload.email.toLowerCase();
    const firstName = payload.given_name || '';
    const lastName = payload.family_name || '';
    const avatar = payload.picture || undefined;

    // Chercher un existant par googleId ou email
    let user = await UserModel.findOne({
      $or: [{ googleId }, { email }],
    }).select('+googleId +passwordHash');

    if (user) {
      // Compte existant : lier Google si pas encore lié
      if (!user.googleId) {
        user.googleId = googleId;
        if (avatar && !user.avatar) user.avatar = avatar;
        await user.save();
      }

      // Google a authentifié ET vérifié l'adresse (contrôlé plus haut avec
      // `email_verified === false`). Un compte inscrit par mot de passe qui
      // n'a jamais confirmé son email ne doit donc pas rester bloqué
      // indéfiniment sous prétexte qu'il se reconnecte avec Google.
      if (!user.emailVerified) {
        user.emailVerified = true;
        user.emailVerifyToken = undefined;
        user.emailVerifyExpires = undefined;
        await user.save();
      }

      // Même règle que pour le login par mot de passe : un compte suspendu ou
      // banni ne doit pas pouvoir se réauthentifier via Google, sinon le
      // bannishment est contournable en changeant de méthode de connexion.
      if (user.status !== UserAccountStatus.ACTIVE) {
        throw new AppError(
          ErrorCode.FORBIDDEN,
          user.status === UserAccountStatus.BANNED
            ? 'Ce compte a été banni. Contactez le support.'
            : 'Ce compte est suspendu. Contactez le support.',
          403,
        );
      }

      await AuditService.log({
        actor: String(user._id),
        action: 'user.login',
        entityType: 'User',
        entityId: String(user._id),
        metadata: { provider: 'google' },
      });

      return user;
    }

    // Nouveau compte : créer
    const country = getCountry(input.country || 'SN');
    if (!country) {
      throw new AppError(ErrorCode.VALIDATION_ERROR, 'Pays non supporté', 400);
    }

    // Générer un username unique à partir du nom
    const baseUsername = (firstName + lastName)
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '')
      .slice(0, 20);
    let username = baseUsername || `user_${Date.now()}`;
    let suffix = 0;
    while (await UserModel.findOne({ username })) {
      suffix++;
      username = `${baseUsername}${suffix}`;
    }

    user = await UserModel.create({
      email,
      googleId,
      firstName: firstName || email.split('@')[0],
      lastName: lastName || '',
      username,
      avatar,
      country: country.code,
      currency: country.currency,
      roles: [UserRole.USER],
      emailVerified: true, // Google vérifie déjà l'email
    });

    await AuditService.log({
      actor: String(user._id),
      action: 'user.registered',
      entityType: 'User',
      entityId: String(user._id),
      metadata: { provider: 'google' },
    });

    if (input.sessionId) {
      await AffiliateAttributionService.attachSessionToUser(input.sessionId, String(user._id));
    }

    // Email de bienvenue
    EmailService.sendWelcome(user.email, user.firstName).catch(() => {});

    return user;
  }
}
