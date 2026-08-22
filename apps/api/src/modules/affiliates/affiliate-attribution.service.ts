import { AffiliateStatus, AttributionType } from '@gm/types';
import { AppError } from '../../lib/errors/app-error.js';
import { ErrorCode } from '../../lib/errors/error-codes.js';
import { AffiliateModel } from './affiliate.model.js';
import { AffiliateClickModel } from './affiliate-click.model.js';
import { AffiliateAttributionModel } from './affiliate-attribution.model.js';
import { hashIp } from './ip-hash.js';
import { logger } from '../../lib/logger.js';
import { AffiliateFraudService } from './affiliate-fraud.service.js';

export interface RecordClickInput {
  affiliateCode: string;
  sessionId: string;
  landingPage: string;
  referrer?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  campaignId?: string;
  deviceType?: string;
  country?: string;
  ip?: string;
  userId?: string;
}

/**
 * Règle d'attribution (§7) — priorité stricte, jamais de partage entre
 * affiliés pour une même transaction:
 *   1. Code promo explicitement saisi au checkout
 *   2. Attribution affiliée existante liée au compte/session (non expirée,
 *      non consommée)
 *   3. Dernier clic affilié valide (fallback si aucune attribution formelle
 *      n'a été enregistrée, ex: session très récente)
 *
 * Cette résolution vit UNIQUEMENT ici — aucun autre service ne doit
 * réimplémenter cette priorité.
 */
export class AffiliateAttributionService {
  static async recordClick(input: RecordClickInput): Promise<void> {
    const affiliate = await AffiliateModel.findOne({
      affiliateCode: input.affiliateCode.toUpperCase(),
      status: AffiliateStatus.ACTIVE,
    });
    if (!affiliate) {
      logger.warn({ code: input.affiliateCode }, 'Clic sur un code affilié inconnu/inactif');
      return;
    }

    await AffiliateClickModel.create({
      affiliate: affiliate._id,
      affiliateCode: affiliate.affiliateCode,
      campaign: input.campaignId,
      landingPage: input.landingPage,
      referrer: input.referrer,
      utmSource: input.utmSource,
      utmMedium: input.utmMedium,
      utmCampaign: input.utmCampaign,
      deviceType: input.deviceType,
      country: input.country,
      sessionId: input.sessionId,
      userId: input.userId,
      ipHash: input.ip ? hashIp(input.ip) : undefined,
    });

    await AffiliateModel.findByIdAndUpdate(affiliate._id, { $inc: { totalClicks: 1 } });

    await AffiliateFraudService.checkClickRate(String(affiliate._id));

    const expiresAt = new Date(Date.now() + affiliate.cookieDurationDays * 24 * 60 * 60 * 1000);
    await AffiliateAttributionModel.create({
      affiliate: affiliate._id,
      affiliateCode: affiliate.affiliateCode,
      campaign: input.campaignId,
      sessionId: input.sessionId,
      userId: input.userId,
      attributionType: AttributionType.AFFILIATE_LINK,
      expiresAt,
    });
  }

  /**
   * Rattache les attributions "sessionId" existantes au compte fraîchement
   * créé — appelé depuis AuthService.register (§9).
   */
  static async attachSessionToUser(sessionId: string, userId: string): Promise<void> {
    await AffiliateAttributionModel.updateMany(
      { sessionId, userId: { $exists: false }, consumedAt: null },
      { $set: { userId } },
    );
  }

  /**
   * Résout l'attribution applicable pour une transaction, selon la priorité
   * stricte définie ci-dessus. Retourne null si aucune attribution valide.
   */
  static async resolveAttribution(input: {
    promoCode?: string;
    sessionId?: string;
    userId?: string;
  }): Promise<{
    affiliateId: string;
    attributionType: AttributionType;
    attributionId?: string;
    promoCode?: string;
  } | null> {
    // Priorité 1: code promo explicite — résolu par PromoCodeService, pas
    // ici (ce service ne connaît pas les règles de remise). On se contente
    // ici de signaler le type si un code est fourni et rattaché à un
    // affilié — la validation complète du code est faite par
    // PromoCodeService.validateAndApply avant l'appel à ce service.
    if (input.promoCode) {
      return null; // signal explicite: à résoudre côté appelant via PromoCodeService
    }

    // Priorité 2: attribution existante liée au compte ou à la session,
    // non expirée, non consommée — la plus récente d'abord.
    const query = input.userId
      ? { userId: input.userId, consumedAt: null, expiresAt: { $gt: new Date() } }
      : input.sessionId
        ? { sessionId: input.sessionId, consumedAt: null, expiresAt: { $gt: new Date() } }
        : null;

    if (!query) return null;

    const attribution = await AffiliateAttributionModel.findOne(query).sort({ createdAt: -1 });
    if (!attribution) return null;

    return {
      affiliateId: String(attribution.affiliate),
      attributionType: attribution.attributionType as AttributionType,
      attributionId: String(attribution._id),
    };
  }

  static async markConsumed(attributionId: string): Promise<void> {
    await AffiliateAttributionModel.findByIdAndUpdate(attributionId, {
      consumedAt: new Date(),
    });
  }

  static async assertAffiliateActive(affiliateId: string): Promise<void> {
    const affiliate = await AffiliateModel.findById(affiliateId);
    if (!affiliate || affiliate.status !== AffiliateStatus.ACTIVE) {
      throw new AppError(
        ErrorCode.FORBIDDEN,
        "Cet affilié n'est plus actif, l'attribution est ignorée",
        409,
      );
    }
  }
}
