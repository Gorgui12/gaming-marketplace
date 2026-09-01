import type { Request, Response } from 'express';
import { z } from 'zod';
import { TransactionState, UserAccountStatus, UserRole } from '@gm/types';
import { asyncHandler } from '../../lib/async-handler.js';
import { AppError } from '../../lib/errors/app-error.js';
import { ErrorCode } from '../../lib/errors/error-codes.js';
import { AuditService } from '../audit/audit.service.js';
import { UserModel } from './admin-stats.models.js';
import { EmailService } from '../../lib/email/email.service.js';
import { TransactionModel } from '../transactions/transaction.model.js';
import { ListingModel } from '../listings/listing.model.js';
import { NotificationModel } from '../notifications/notification.model.js';
import { ReviewModel } from '../reviews/review.model.js';
import { ConversationModel } from '../messaging/conversation.model.js';
import { MessageModel } from '../messaging/message.model.js';
import { SecureAccountCredentialModel } from '../transactions/secure-account-credential.model.js';
import { AffiliateModel } from '../affiliates/affiliate.model.js';
import { AffiliateCampaignModel } from '../affiliates/affiliate-campaign.model.js';
import { AffiliateClickModel } from '../affiliates/affiliate-click.model.js';
import { AffiliateConversionModel } from '../affiliates/affiliate-conversion.model.js';
import { AffiliatePayoutModel } from '../affiliates/affiliate-payout.model.js';
import { PromoCodeModel } from '../affiliates/promo-code.model.js';

const USER_SEARCH_MAX = 50;

const TERMINAL_TRANSACTION_STATES = [
  TransactionState.COMPLETED,
  TransactionState.REFUNDED,
  TransactionState.CANCELLED,
] as const;

export const listAdminUsers = asyncHandler(async (req: Request, res: Response) => {
  const query = z
    .object({
      search: z.string().trim().max(200).optional(),
      status: z.enum(Object.values(UserAccountStatus) as [string, ...string[]]).optional(),
      page: z.coerce.number().int().positive().default(1),
      pageSize: z.coerce.number().int().positive().max(USER_SEARCH_MAX).default(20),
    })
    .parse(req.query);

  const filter: Record<string, unknown> = {};
  if (query.status) filter.status = query.status;
  if (query.search) {
    const rx = new RegExp(query.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [{ email: rx }, { username: rx }, { firstName: rx }, { lastName: rx }];
  }

  const skip = (query.page - 1) * query.pageSize;
  const [users, total] = await Promise.all([
    UserModel.find(filter)
      .select(
        '-passwordHash -referredByAffiliate',
      )
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(query.pageSize),
    UserModel.countDocuments(filter),
  ]);

  res.status(200).json({
    success: true,
    data: {
      users,
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.ceil(total / query.pageSize),
    },
  });
});

const updateStatusSchema = z.object({
  status: z.enum([UserAccountStatus.ACTIVE, UserAccountStatus.SUSPENDED, UserAccountStatus.BANNED]),
});

export const updateUserStatus = asyncHandler(async (req: Request, res: Response) => {
  const { status } = updateStatusSchema.parse(req.body);
  const userId = req.params.id!;

  const user = await UserModel.findById(userId);
  if (!user) {
    throw AppError.notFound(ErrorCode.NOT_FOUND, 'Utilisateur introuvable');
  }
  if (user.roles.includes('SUPER_ADMIN') && status !== UserAccountStatus.ACTIVE) {
    throw AppError.forbidden('Un SUPER_ADMIN ne peut pas être suspendu ou banni');
  }

  user.status = status;
  await user.save();

  await AuditService.log({
    actor: req.user!.id,
    action: `user.${status.toLowerCase()}`,
    entityType: 'User',
    entityId: String(user._id),
    metadata: { email: user.email },
  });

  // Notification email
  const reason = String(req.body?.reason ?? 'Non précisé');
  if (status === UserAccountStatus.SUSPENDED) {
    EmailService.sendAccountSuspended({ to: user.email, firstName: user.firstName, reason }).catch(() => {});
  } else if (status === UserAccountStatus.BANNED) {
    EmailService.sendAccountBanned({ to: user.email, firstName: user.firstName, reason }).catch(() => {});
  }

  res.status(200).json({
    success: true,
    data: {
      id: user._id,
      email: user.email,
      username: user.username,
      status: user.status,
    },
  });
});

const updateRolesSchema = z.object({
  roles: z.array(z.enum(Object.values(UserRole) as [string, ...string[]])).min(1),
});

export const updateUserRoles = asyncHandler(async (req: Request, res: Response) => {
  const { roles } = updateRolesSchema.parse(req.body);
  const actor = req.user!;
  const userId = req.params.id!;

  const target = await UserModel.findById(userId);
  if (!target) {
    throw AppError.notFound(ErrorCode.NOT_FOUND, 'Utilisateur introuvable');
  }

  const actorIsSuper = actor.roles.includes(UserRole.SUPER_ADMIN);
  const touchesSuperAdmin =
    roles.includes(UserRole.SUPER_ADMIN) || target.roles.includes(UserRole.SUPER_ADMIN);
  if (!actorIsSuper && touchesSuperAdmin) {
    throw AppError.forbidden('Seul un SUPER_ADMIN peut gérer les comptes SUPER_ADMIN');
  }

  // Éviter le lock-out : un admin ne peut pas retirer PROPRE accès admin.
  if (userId === actor.id) {
    const keepsAdmin = roles.some((r) => r === UserRole.ADMIN || r === UserRole.SUPER_ADMIN);
    if (!keepsAdmin) {
      throw AppError.forbidden('Vous ne pouvez pas retirer vos propres rôles administrateur');
    }
  }

  target.roles = roles as UserRole[];
  await target.save();

  await AuditService.log({
    actor: actor.id,
    action: 'admin.user_roles_updated',
    entityType: 'User',
    entityId: userId,
    metadata: { email: target.email, roles },
  });

  res.status(200).json({
    success: true,
    data: { id: target._id, email: target.email, roles: target.roles },
  });
});

export const deleteAdminUser = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.params.id!;
  const actorId = req.user!.id;

  if (userId === actorId) {
    throw AppError.forbidden('Vous ne pouvez pas supprimer votre propre compte');
  }

  const user = await UserModel.findById(userId);
  if (!user) {
    throw AppError.notFound(ErrorCode.NOT_FOUND, 'Utilisateur introuvable');
  }
  if (user.roles.includes(UserRole.SUPER_ADMIN)) {
    throw AppError.forbidden('Un SUPER_ADMIN ne peut pas être supprimé');
  }

  // Garde-fou : tant qu'une transaction est en cours, la suppression rendrait
  // le flux couteux et casserait le séquestre. On bloque.
  const activeTransactions = await TransactionModel.countDocuments({
    $or: [{ buyer: userId }, { seller: userId }],
    escrowStatus: { $nin: TERMINAL_TRANSACTION_STATES },
  });
  if (activeTransactions > 0) {
    throw AppError.conflict(
      ErrorCode.CONFLICT,
      'Impossible de supprimer : cet utilisateur a des transactions en cours.',
    );
  }

  // ---- Cascade ----
  // Annonces (et leurs accès chiffrés), notifications, avis.
  const listings = await ListingModel.find({ seller: userId }).select({ _id: 1 });
  const listingIds = listings.map((l) => String(l._id));
  await ListingModel.deleteMany({ seller: userId });
  await SecureAccountCredentialModel.deleteMany({ seller: userId });
  // Sécurité : une annonce supprimée peut laisser des accès avec un seller différent (rare).
  if (listingIds.length > 0) {
    await SecureAccountCredentialModel.deleteMany({ listing: { $in: listingIds } });
  }
  await NotificationModel.deleteMany({ user: userId });
  await ReviewModel.deleteMany({ $or: [{ author: userId }, { target: userId }] });

  // Conversations : retirer l'utilisateur ; si vide, supprimer + messages.
  const conversations = await ConversationModel.find({ participants: userId });
  for (const conversation of conversations) {
    conversation.participants = conversation.participants.filter(
      (p) => String(p) !== userId,
    );
    if (conversation.participants.length === 0) {
      await MessageModel.deleteMany({ conversation: conversation._id });
      await ConversationModel.deleteOne({ _id: conversation._id });
    } else {
      await conversation.save();
    }
  }

  // Profil affilié + tout ce qui en dépend.
  const affiliate = await AffiliateModel.findOne({ user: userId });
  if (affiliate) {
    const affiliateId = String(affiliate._id);
    await AffiliatePayoutModel.deleteMany({ affiliate: affiliateId });
    await AffiliateClickModel.deleteMany({ affiliate: affiliateId });
    await AffiliateConversionModel.deleteMany({ affiliate: affiliateId });
    await AffiliateCampaignModel.deleteMany({ affiliate: affiliateId });
    await PromoCodeModel.deleteMany({ affiliate: affiliateId });
    await UserModel.updateMany(
      { referredByAffiliate: affiliateId },
      { $set: { referredByAffiliate: null } },
    );
    await AffiliateModel.deleteOne({ _id: affiliateId });
  }

  await UserModel.deleteOne({ _id: userId });

  await AuditService.log({
    actor: actorId,
    action: 'admin.user_deleted',
    entityType: 'User',
    entityId: userId,
    metadata: { email: user.email, username: user.username },
  });

  res.status(200).json({
    success: true,
    data: { id: userId, email: user.email, username: user.username },
  });
});