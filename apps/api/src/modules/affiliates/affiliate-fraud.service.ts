import { FraudReviewStatus } from '@gm/types';
import { AffiliateModel } from './affiliate.model.js';
import { AffiliateClickModel } from './affiliate-click.model.js';
import { AuditService } from '../audit/audit.service.js';
import { logger } from '../../lib/logger.js';

/**
 * Règles simples au MVP (§13) — jamais de blocage automatique définitif,
 * seulement une mise en REVIEW pour analyse admin. BLOCKED reste une
 * action manuelle admin (voir routes admin), jamais déclenchée
 * automatiquement par ce service.
 */
const SUSPICIOUS_CLICK_RATE_PER_HOUR = 60; // au-delà: pattern de clics automatisés probable

export class AffiliateFraudService {
  /**
   * À appeler après l'enregistrement d'un clic — vérifie un débit de clics
   * anormal depuis la même session/IP hashée sur la dernière heure.
   */
  static async checkClickRate(affiliateId: string): Promise<void> {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const recentClicks = await AffiliateClickModel.countDocuments({
      affiliate: affiliateId,
      createdAt: { $gte: oneHourAgo },
    });

    if (recentClicks > SUSPICIOUS_CLICK_RATE_PER_HOUR) {
      const affiliate = await AffiliateModel.findById(affiliateId);
      if (affiliate && affiliate.fraudReviewStatus === FraudReviewStatus.NORMAL) {
        affiliate.fraudReviewStatus = FraudReviewStatus.REVIEW;
        await affiliate.save();
        logger.warn(
          { affiliateId, recentClicks },
          'Taux de clics suspect détecté, affilié mis en REVIEW',
        );
        await AuditService.log({
          actor: null,
          action: 'affiliate.fraud_review_triggered',
          entityType: 'Affiliate',
          entityId: affiliateId,
          metadata: { reason: 'suspicious_click_rate', recentClicks },
        });
      }
    }
  }

  /**
   * Vérifie qu'un acheteur n'est pas le titulaire du compte affilié
   * (auto-parrainage) — la vérification définitive vit dans
   * AffiliateCommissionService.createConversionIfAttributed, ce helper
   * sert aux endroits où on veut vérifier en amont (ex: application d'un
   * code promo au checkout).
   */
  static isSelfReferral(affiliateUserId: string, buyerId: string): boolean {
    return String(affiliateUserId) === String(buyerId);
  }
}
