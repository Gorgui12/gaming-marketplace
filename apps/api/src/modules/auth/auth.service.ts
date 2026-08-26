import crypto from 'node:crypto';
import argon2 from 'argon2';
import { OAuth2Client } from 'google-auth-library';
import { UserRole } from '@gm/types';
import type { LoginInput, RegisterInput, ForgotPasswordInput, ResetPasswordInput, GoogleAuthInput } from '@gm/validation';
import { AppError } from '../../lib/errors/app-error.js';
import { ErrorCode } from '../../lib/errors/error-codes.js';
import { UserModel } from '../users/user.model.js';
import { getCountry } from '@gm/config';
import { AuditService } from '../audit/audit.service.js';
import { AffiliateAttributionService } from '../affiliates/affiliate-attribution.service.js';
import { EmailService } from '../../lib/email/email.service.js';
import { env } from '../../config/env.js';

const googleClient = env.GOOGLE_CLIENT_ID ? new OAuth2Client(env.GOOGLE_CLIENT_ID) : null;

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
    });

    await AuditService.log({
      actor: String(user._id),
      action: 'user.registered',
      entityType: 'User',
      entityId: String(user._id),
    });

    if (input.sessionId) {
      await AffiliateAttributionService.attachSessionToUser(input.sessionId, String(user._id));
    }

    // Envoi email de bienvenue (async, sans attendre)
    EmailService.sendWelcome(user.email, user.firstName).catch(() => {});

    return user;
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

    await AuditService.log({
      actor: String(user._id),
      action: 'user.login',
      entityType: 'User',
      entityId: String(user._id),
    });

    return user;
  }

  static async forgotPassword(input: ForgotPasswordInput) {
    const user = await UserModel.findOne({ email: input.email });
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

    const resetUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/reset-password?token=${token}`;

    EmailService.sendPasswordReset(user.email, user.firstName, resetUrl).catch(() => {});
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
