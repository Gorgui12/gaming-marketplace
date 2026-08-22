import argon2 from 'argon2';
import { UserRole } from '@gm/types';
import type { LoginInput, RegisterInput } from '@gm/validation';
import { AppError } from '../../lib/errors/app-error.js';
import { ErrorCode } from '../../lib/errors/error-codes.js';
import { UserModel } from '../users/user.model.js';
import { getCountry } from '@gm/config';
import { AuditService } from '../audit/audit.service.js';
import { AffiliateAttributionService } from '../affiliates/affiliate-attribution.service.js';

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

    return user;
  }

  static async login(input: LoginInput) {
    const user = await UserModel.findOne({ email: input.email }).select('+passwordHash');
    if (!user) {
      throw new AppError(ErrorCode.INVALID_CREDENTIALS, 'Identifiants invalides', 401);
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
}
