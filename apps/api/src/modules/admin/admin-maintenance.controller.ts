import type { Request, Response } from 'express';
import { isValidObjectId } from 'mongoose';
import { z } from 'zod';
import { asyncHandler } from '../../lib/async-handler.js';
import { AppError } from '../../lib/errors/app-error.js';
import { ErrorCode } from '../../lib/errors/error-codes.js';
import { AuditService } from '../audit/audit.service.js';
import {
  AffiliateModel,
  DisputeModel,
  ListingModel,
  TransactionModel,
  UserModel,
} from './admin-stats.models.js';
import { GameModel } from '../games/game.model.js';
import { ReviewModel } from '../reviews/review.model.js';
import { NotificationModel } from '../notifications/notification.model.js';
import { ConversationModel } from '../messaging/conversation.model.js';
import { MessageModel } from '../messaging/message.model.js';
import { PostModel } from '../blog/post.model.js';
import { PromoCodeModel } from '../affiliates/promo-code.model.js';
import { SecureAccountCredentialModel } from '../transactions/secure-account-credential.model.js';
import { AffiliateCampaignModel } from '../affiliates/affiliate-campaign.model.js';
import { AffiliateClickModel } from '../affiliates/affiliate-click.model.js';
import { AffiliateConversionModel } from '../affiliates/affiliate-conversion.model.js';
import { AffiliatePayoutModel } from '../affiliates/affiliate-payout.model.js';
import { AuditLogModel } from '../audit/audit-log.model.js';

type ModelLike = {
  find(filter?: Record<string, unknown>): PromiseLike<unknown>;
  countDocuments(filter?: Record<string, unknown>): PromiseLike<number>;
  deleteMany(filter?: Record<string, unknown>): PromiseLike<{ deletedCount: number }>;
};

function md(model: unknown): ModelLike {
  return model as ModelLike;
}

/**
 * Règles de détection d'orphelins : `model` pointe vers `ref`, et cette
 * référence n'existe plus dans `target`. Ces enregistrements sont devenus
 * inutiles (parent supprimé) et peuvent être purgés.
 */
interface SimpleRefRule {
  key: string;
  model: ModelLike;
  ref: string;
  target: ModelLike;
}

const SIMPLE_RULES: SimpleRefRule[] = [
  { key: 'annonces_sans_jeu', model: md(ListingModel), ref: 'game', target: md(GameModel) },
  { key: 'annonces_sans_vendeur', model: md(ListingModel), ref: 'seller', target: md(UserModel) },
  { key: 'transactions_sans_annonce', model: md(TransactionModel), ref: 'listing', target: md(ListingModel) },
  { key: 'transactions_sans_acheteur', model: md(TransactionModel), ref: 'buyer', target: md(UserModel) },
  { key: 'transactions_sans_vendeur', model: md(TransactionModel), ref: 'seller', target: md(UserModel) },
  { key: 'litiges_sans_transaction', model: md(DisputeModel), ref: 'transaction', target: md(TransactionModel) },
  { key: 'notifications_sans_utilisateur', model: md(NotificationModel), ref: 'user', target: md(UserModel) },
  { key: 'avis_sans_transaction', model: md(ReviewModel), ref: 'transaction', target: md(TransactionModel) },
  { key: 'avis_sans_auteur', model: md(ReviewModel), ref: 'author', target: md(UserModel) },
  { key: 'avis_sans_cible', model: md(ReviewModel), ref: 'target', target: md(UserModel) },
  { key: 'messages_sans_conversation', model: md(MessageModel), ref: 'conversation', target: md(ConversationModel) },
  { key: 'messages_sans_expediteur', model: md(MessageModel), ref: 'sender', target: md(UserModel) },
  { key: 'articles_sans_auteur', model: md(PostModel), ref: 'author', target: md(UserModel) },
  { key: 'campagnes_sans_affilie', model: md(AffiliateCampaignModel), ref: 'affiliate', target: md(AffiliateModel) },
  { key: 'clics_sans_affilie', model: md(AffiliateClickModel), ref: 'affiliate', target: md(AffiliateModel) },
  { key: 'clics_sans_campagne', model: md(AffiliateClickModel), ref: 'campaign', target: md(AffiliateCampaignModel) },
  { key: 'conversions_sans_affilie', model: md(AffiliateConversionModel), ref: 'affiliate', target: md(AffiliateModel) },
  { key: 'conversions_sans_transaction', model: md(AffiliateConversionModel), ref: 'transaction', target: md(TransactionModel) },
  { key: 'conversions_sans_acheteur', model: md(AffiliateConversionModel), ref: 'buyer', target: md(UserModel) },
  { key: 'payouts_sans_affilie', model: md(AffiliatePayoutModel), ref: 'affiliate', target: md(AffiliateModel) },
  { key: 'codes_promo_sans_affilie', model: md(PromoCodeModel), ref: 'affiliate', target: md(AffiliateModel) },
  { key: 'acces_compte_sans_annonce', model: md(SecureAccountCredentialModel), ref: 'listing', target: md(ListingModel) },
  { key: 'acces_compte_sans_vendeur', model: md(SecureAccountCredentialModel), ref: 'seller', target: md(UserModel) },
];

const COUNT_ENTRIES: Array<[string, ModelLike]> = [
  ['users', md(UserModel)],
  ['games', md(GameModel)],
  ['listings', md(ListingModel)],
  ['transactions', md(TransactionModel)],
  ['disputes', md(DisputeModel)],
  ['reviews', md(ReviewModel)],
  ['notifications', md(NotificationModel)],
  ['conversations', md(ConversationModel)],
  ['messages', md(MessageModel)],
  ['posts', md(PostModel)],
  ['promoCodes', md(PromoCodeModel)],
  ['affiliates', md(AffiliateModel)],
  ['affiliateCampaigns', md(AffiliateCampaignModel)],
  ['affiliateClicks', md(AffiliateClickModel)],
  ['affiliateConversions', md(AffiliateConversionModel)],
  ['affiliatePayouts', md(AffiliatePayoutModel)],
  ['secureCredentials', md(SecureAccountCredentialModel)],
  ['auditLogs', md(AuditLogModel)],
];

const RESET_TARGETS: Record<string, ModelLike> = Object.fromEntries(COUNT_ENTRIES);

async function findOrphanIds(rule: SimpleRefRule): Promise<string[]> {
  const docs = (await rule.model.find({ [rule.ref]: { $ne: null } })) as Array<
    Record<string, unknown>
  >;
  const refIdSet = new Set<string>();
  for (const d of docs) {
    const ref = d[rule.ref];
    if (ref && isValidObjectId(String(ref))) refIdSet.add(String(ref));
  }
  if (refIdSet.size === 0) return [];

  const existingDocs = (await rule.target.find({ _id: { $in: [...refIdSet] } })) as Array<
    Record<string, unknown>
  >;
  const existing = new Set(existingDocs.map((d) => String(d._id)));
  return docs
    .filter((d) => {
      const ref = d[rule.ref];
      return ref ? !existing.has(String(ref)) : false;
    })
    .map((d) => String(d._id));
}

async function orphanConversationIds(): Promise<string[]> {
  const convs = (await ConversationModel.find({})) as Array<Record<string, unknown>>;
  const orphanIds: string[] = [];
  for (const c of convs) {
    const participants = (c.participants as unknown[]) ?? [];
    const tx = c.transaction;
    if (participants.length === 0 || !tx || !isValidObjectId(String(tx))) {
      orphanIds.push(String(c._id));
      continue;
    }
    const exists = await TransactionModel.countDocuments({ _id: tx as unknown });
    if (!exists) orphanIds.push(String(c._id));
  }
  return orphanIds;
}

async function orphanSummary(): Promise<Record<string, number>> {
  const results: Record<string, number> = {};
  for (const rule of SIMPLE_RULES) {
    results[rule.key] = (await findOrphanIds(rule)).length;
  }
  results['conversations_sans_transaction_ou_vides'] = (await orphanConversationIds()).length;
  return results;
}

export const getDbStats = asyncHandler(async (_req: Request, res: Response) => {
  const [counts, orphans] = await Promise.all([
    Promise.all(COUNT_ENTRIES.map(async ([key, model]) => [key, await model.countDocuments({})] as const)),
    orphanSummary(),
  ]);

  res.status(200).json({
    success: true,
    data: {
      counts: Object.fromEntries(counts),
      orphans,
    },
  });
});

export const cleanupDbOrphans = asyncHandler(async (req: Request, res: Response) => {
  const result: Record<string, number> = {};

  for (const rule of SIMPLE_RULES) {
    const ids = await findOrphanIds(rule);
    if (ids.length > 0) {
      const deleted = await rule.model.deleteMany({ _id: { $in: ids } });
      result[rule.key] = deleted.deletedCount;
    } else {
      result[rule.key] = 0;
    }
  }

  const convIds = await orphanConversationIds();
  if (convIds.length > 0) {
    await MessageModel.deleteMany({ conversation: { $in: convIds } });
    const deleted = await ConversationModel.deleteMany({ _id: { $in: convIds } });
    result['conversations_sans_transaction_ou_vides'] = deleted.deletedCount;
  } else {
    result['conversations_sans_transaction_ou_vides'] = 0;
  }

  await AuditService.log({
    actor: req.user!.id,
    action: 'admin.db_orphans_cleanup',
    entityType: 'DbMaintenance',
    entityId: req.user!.id,
    metadata: { deleted: result },
  });

  res.status(200).json({ success: true, data: { deleted: result } });
});

const resetSchema = z.object({
  target: z.string().trim().min(1),
  confirm: z.string().trim().min(1),
});

export const resetDbCollection = asyncHandler(async (req: Request, res: Response) => {
  const { target, confirm } = resetSchema.parse(req.body);
  const model = RESET_TARGETS[target];
  if (!model) {
    throw new AppError(ErrorCode.NOT_FOUND, 'Collection inconnue', 404);
  }
  if (confirm !== target) {
    throw AppError.conflict(
      ErrorCode.CONFLICT,
      'Confirmation invalide : tapez exactement le nom de la collection à vider.',
    );
  }

  const result = await model.deleteMany({});

  await AuditService.log({
    actor: req.user!.id,
    action: `admin.db_reset.${target}`,
    entityType: 'DbMaintenance',
    entityId: req.user!.id,
    metadata: { deletedCount: result.deletedCount },
  });

  res.status(200).json({
    success: true,
    data: { target, deletedCount: result.deletedCount },
  });
});