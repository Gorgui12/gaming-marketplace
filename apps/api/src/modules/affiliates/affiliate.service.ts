import { AffiliateStatus } from '@gm/types';
import { generateAffiliateCode } from '@gm/utils';
import { DEFAULT_STARTER_COMMISSION_RATE } from '@gm/config';
import type { ApplyForAffiliateInput, ReviewAffiliateApplicationInput } from '@gm/validation';
import { AppError } from '../../lib/errors/app-error.js';
import { ErrorCode } from '../../lib/errors/error-codes.js';
import { AffiliateModel } from './affiliate.model.js';
import { AffiliateTierModel } from './affiliate-tier.model.js';
import { AuditService } from '../audit/audit.service.js';

export class AffiliateService {
  static async apply(userId: string, input: ApplyForAffiliateInput) {
    const existing = await AffiliateModel.findOne({ user: userId });
    if (existing) {
      throw new AppError(
        ErrorCode.CONFLICT,
        'Une candidature ou un compte affilié existe déjà pour cet utilisateur',
        409,
      );
    }

    let code = generateAffiliateCode(input.displayName);
    for (let attempts = 0; attempts < 5; attempts += 1) {
      const clash = await AffiliateModel.findOne({ affiliateCode: code });
      if (!clash) break;
      code = generateAffiliateCode(input.displayName);
    }

    const starterTier = await AffiliateTierModel.findOne({ slug: 'starter' });

    const affiliate = await AffiliateModel.create({
      user: userId,
      affiliateCode: code,
      displayName: input.displayName,
      description: input.description,
      socialLinks: input.socialLinks,
      status: AffiliateStatus.PENDING,
      commissionRate: starterTier?.defaultCommissionRate ?? DEFAULT_STARTER_COMMISSION_RATE,
      tier: starterTier?._id,
    });

    await AuditService.log({
      actor: userId,
      action: 'affiliate.application_submitted',
      entityType: 'Affiliate',
      entityId: String(affiliate._id),
      metadata: { socialLinks: input.socialLinks },
    });

    return affiliate;
  }

  static async review(input: {
    affiliateId: string;
    adminId: string;
    decision: ReviewAffiliateApplicationInput;
  }) {
    const affiliate = await AffiliateModel.findById(input.affiliateId);
    if (!affiliate) {
      throw AppError.notFound(ErrorCode.NOT_FOUND, 'Candidature introuvable');
    }
    if (affiliate.status !== AffiliateStatus.PENDING) {
      throw new AppError(ErrorCode.CONFLICT, 'Cette candidature a déjà été traitée', 409);
    }

    if (input.decision.decision === 'REJECT') {
      affiliate.status = AffiliateStatus.REJECTED;
      await affiliate.save();
      await AuditService.log({
        actor: input.adminId,
        action: 'affiliate.application_rejected',
        entityType: 'Affiliate',
        entityId: String(affiliate._id),
        metadata: { notes: input.decision.notes },
      });
      return affiliate;
    }

    if (input.decision.tierSlug) {
      const tier = await AffiliateTierModel.findOne({ slug: input.decision.tierSlug });
      if (!tier) {
        throw new AppError(ErrorCode.VALIDATION_ERROR, 'Tier inconnu', 400);
      }
      affiliate.tier = tier._id;
      affiliate.commissionRate = input.decision.commissionRate ?? tier.defaultCommissionRate;
    } else if (input.decision.commissionRate !== undefined) {
      affiliate.commissionRate = input.decision.commissionRate;
    }

    affiliate.status = AffiliateStatus.ACTIVE;
    await affiliate.save();

    await AuditService.log({
      actor: input.adminId,
      action: 'affiliate.application_approved',
      entityType: 'Affiliate',
      entityId: String(affiliate._id),
      metadata: { commissionRate: affiliate.commissionRate },
    });

    return affiliate;
  }

  static async setStatus(input: {
    affiliateId: string;
    adminId: string;
    status: 'ACTIVE' | 'SUSPENDED' | 'TERMINATED';
  }) {
    const affiliate = await AffiliateModel.findById(input.affiliateId);
    if (!affiliate) {
      throw AppError.notFound(ErrorCode.NOT_FOUND, 'Affilié introuvable');
    }
    affiliate.status = input.status as AffiliateStatus;
    await affiliate.save();

    await AuditService.log({
      actor: input.adminId,
      action: `affiliate.status_changed_${input.status.toLowerCase()}`,
      entityType: 'Affiliate',
      entityId: String(affiliate._id),
    });

    return affiliate;
  }

  static async getDashboard(userId: string) {
    const affiliate = await AffiliateModel.findOne({ user: userId }).populate(
      'tier',
      'name slug defaultCommissionRate',
    );
    if (!affiliate) {
      throw AppError.notFound(ErrorCode.NOT_FOUND, "Vous n'avez pas de compte affilié");
    }
    return affiliate;
  }

  static async getByCode(code: string) {
    return AffiliateModel.findOne({
      affiliateCode: code.toUpperCase(),
      status: AffiliateStatus.ACTIVE,
    });
  }

  static async listTiers() {
    return AffiliateTierModel.find().sort({ defaultCommissionRate: 1 });
  }

  /**
   * Met à jour le taux par défaut d'un niveau (admin). Ne modifie pas les
   * affiliés déjà rattachés à ce niveau — ils gardent leur taux custom si
   * ils en ont un, sinon il faut changer leur niveau manuellement.
   */
  static async updateTier(input: {
    tierId: string;
    adminId: string;
    defaultCommissionRate: number;
    minConversionsToUpgrade?: number;
    name?: string;
  }) {
    const tier = await AffiliateTierModel.findById(input.tierId);
    if (!tier) {
      throw AppError.notFound(ErrorCode.NOT_FOUND, 'Niveau introuvable');
    }
    if (input.name !== undefined) tier.name = input.name;
    tier.defaultCommissionRate = input.defaultCommissionRate;
    if (input.minConversionsToUpgrade !== undefined) {
      tier.minConversionsToUpgrade = input.minConversionsToUpgrade;
    }
    await tier.save();

    await AuditService.log({
      actor: input.adminId,
      action: 'affiliate.tier_updated',
      entityType: 'AffiliateTier',
      entityId: String(tier._id),
      metadata: { defaultCommissionRate: input.defaultCommissionRate },
    });

    return tier;
  }

  /**
   * Change le niveau d'un affilié (admin). Applique automatiquement le taux
   * par défaut (ou custom) du niveau choisi sur l'affilié.
   */
  static async changeTier(input: {
    affiliateId: string;
    adminId: string;
    tierSlug: string;
    commissionRate?: number;
  }) {
    const affiliate = await AffiliateModel.findById(input.affiliateId);
    if (!affiliate) {
      throw AppError.notFound(ErrorCode.NOT_FOUND, 'Affilié introuvable');
    }
    const tier = await AffiliateTierModel.findOne({ slug: input.tierSlug });
    if (!tier) {
      throw new AppError(ErrorCode.VALIDATION_ERROR, 'Niveau inconnu', 400);
    }
    affiliate.tier = tier._id;
    affiliate.commissionRate = input.commissionRate ?? tier.defaultCommissionRate;
    await affiliate.save();

    await AuditService.log({
      actor: input.adminId,
      action: 'affiliate.tier_changed',
      entityType: 'Affiliate',
      entityId: String(affiliate._id),
      metadata: { tierSlug: input.tierSlug, commissionRate: affiliate.commissionRate },
    });

    return affiliate;
  }

  static async listForAdmin(filter: { status?: string }) {
    const query: Record<string, unknown> = {};
    if (filter.status) query.status = filter.status;
    return AffiliateModel.find(query)
      .sort({ createdAt: -1 })
      .limit(200)
      .populate('user', 'email firstName lastName username country')
      .populate('tier', 'name slug defaultCommissionRate');
  }
}
