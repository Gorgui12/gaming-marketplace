import { AttributionType, CommissionBase, CommissionStatus, FraudReviewStatus } from '@gm/types';
import { roundMoney } from '@gm/utils';
import { logger } from '../../lib/logger.js';
import { AffiliateModel } from './affiliate.model.js';
import { AffiliateConversionModel } from './affiliate-conversion.model.js';
import { AffiliateAttributionService } from './affiliate-attribution.service.js';
import { AuditService } from '../audit/audit.service.js';

/**
 * Base de calcul par défaut (§11): NET_ORDER_AMOUNT (montant hors
 * commission plateforme, i.e. sellerAmount) plutôt que ORDER_TOTAL.
 * Justification: l'affilié est rémunéré sur l'activité économique réelle
 * générée pour la marketplace côté transaction, sans indexer sa commission
 * sur des frais qui ne sont eux-mêmes pas garantis (ex: si le platformFee
 * change), tout en restant simple à auditer. PLATFORM_REVENUE (assiette =
 * platformFee) reste disponible en configuration si le modèle économique
 * doit évoluer vers "part des revenus de la plateforme" plutôt que "part du
 * montant net généré".
 */
const DEFAULT_COMMISSION_BASE: CommissionBase = CommissionBase.NET_ORDER_AMOUNT;

// Délai de clearance avant qu'une commission APPROVED devienne AVAILABLE.
// Volontairement conservateur au MVP — le temps que la fenêtre de litige
// (BUYER_REVIEWING) et un remboursement éventuel se stabilisent.
const CLEARANCE_PERIOD_DAYS = 7;

interface TransactionLike {
  _id: unknown;
  buyer: unknown;
  amount: number;
  sellerAmount: number;
  platformFee: number;
  currency: string;
}

export class AffiliateCommissionService {
  /**
   * Appelé depuis PaymentService.handleWebhook au moment où la transaction
   * atteint ESCROW_ACTIVE (paiement confirmé). Crée la conversion en statut
   * PENDING. Ne fait RIEN si aucune attribution valide n'est trouvée — ce
   * n'est pas une erreur, la majorité des transactions n'ont pas d'affilié.
   */
  static async createConversionIfAttributed(
    transaction: TransactionLike,
    attribution: {
      affiliateId: string;
      attributionType: AttributionType;
      attributionId?: string;
      promoCode?: string;
      discountAmount?: number;
    } | null,
  ): Promise<void> {
    if (!attribution) return;

    const existing = await AffiliateConversionModel.findOne({ transaction: transaction._id });
    if (existing) {
      logger.info(
        { transactionId: transaction._id },
        'Conversion déjà existante pour cette transaction, ignorée',
      );
      return;
    }

    const affiliate = await AffiliateModel.findById(attribution.affiliateId);
    if (!affiliate) return;

    if (affiliate.fraudReviewStatus === FraudReviewStatus.BLOCKED) {
      logger.warn(
        { affiliateId: attribution.affiliateId, transactionId: transaction._id },
        'Affilié bloqué pour fraude, commission non créée',
      );
      return;
    }

    if (String(affiliate.user) === String(transaction.buyer)) {
      logger.warn(
        { affiliateId: attribution.affiliateId, transactionId: transaction._id },
        'Auto-parrainage détecté, commission bloquée',
      );
      await AuditService.log({
        actor: String(transaction.buyer),
        action: 'affiliate.self_referral_blocked',
        entityType: 'Transaction',
        entityId: String(transaction._id),
        metadata: { affiliateId: attribution.affiliateId },
      });
      return;
    }

    const discountAmount = attribution.discountAmount ?? 0;
    const commissionBaseAmount =
      DEFAULT_COMMISSION_BASE === CommissionBase.ORDER_TOTAL
        ? transaction.amount
        : DEFAULT_COMMISSION_BASE === CommissionBase.PLATFORM_REVENUE
          ? transaction.platformFee
          : transaction.sellerAmount;

    const commissionAmount = roundMoney(commissionBaseAmount * affiliate.commissionRate);

    await AffiliateConversionModel.create({
      affiliate: affiliate._id,
      transaction: transaction._id,
      buyer: transaction.buyer,
      orderAmount: transaction.amount,
      discountAmount,
      commissionBase: DEFAULT_COMMISSION_BASE,
      commissionRate: affiliate.commissionRate,
      commissionAmount,
      attributionType: attribution.attributionType,
      promoCode: attribution.promoCode,
      status: CommissionStatus.PENDING,
    });

    await AffiliateModel.findByIdAndUpdate(affiliate._id, {
      $inc: {
        totalConversions: 1,
        totalRevenue: transaction.amount,
        pendingCommission: commissionAmount,
      },
    });

    if (attribution.attributionId) {
      await AffiliateAttributionService.markConsumed(attribution.attributionId);
    }

    await AuditService.log({
      actor: null,
      action: 'affiliate.conversion_created',
      entityType: 'AffiliateConversion',
      entityId: String(transaction._id),
      metadata: { affiliateId: String(affiliate._id), commissionAmount },
    });
  }

  /**
   * Appelé depuis TransactionsService.confirm au moment où la transaction
   * passe à COMPLETED. Fait passer la commission PENDING -> APPROVED et
   * fixe la date de clearance.
   */
  static async approveForTransaction(transactionId: string): Promise<void> {
    const conversion = await AffiliateConversionModel.findOne({
      transaction: transactionId,
      status: CommissionStatus.PENDING,
    });
    if (!conversion) return;

    conversion.status = CommissionStatus.APPROVED;
    conversion.clearanceDueAt = new Date(
      Date.now() + CLEARANCE_PERIOD_DAYS * 24 * 60 * 60 * 1000,
    );
    await conversion.save();

    await AuditService.log({
      actor: null,
      action: 'affiliate.commission_approved',
      entityType: 'AffiliateConversion',
      entityId: String(conversion._id),
    });
  }

  /**
   * À exécuter périodiquement (cron/job — Phase ultérieure) pour faire
   * passer les commissions APPROVED dont la clearance est passée en
   * AVAILABLE, et mettre à jour les compteurs de l'affilié en conséquence.
   */
  static async releaseAvailableCommissions(): Promise<number> {
    const due = await AffiliateConversionModel.find({
      status: CommissionStatus.APPROVED,
      clearanceDueAt: { $lte: new Date() },
    });

    for (const conversion of due) {
      conversion.status = CommissionStatus.AVAILABLE;
      await conversion.save();
      await AffiliateModel.findByIdAndUpdate(conversion.affiliate, {
        $inc: {
          pendingCommission: -conversion.commissionAmount,
          availableCommission: conversion.commissionAmount,
          totalCommission: conversion.commissionAmount,
        },
      });
    }

    return due.length;
  }

  /**
   * Appelé quand une transaction est remboursée/annulée après qu'une
   * conversion a été créée (§12/§31) — inverse la commission quel que soit
   * son état actuel (PENDING ou APPROVED), jamais après PAID (à traiter
   * manuellement par l'admin dans ce cas rare, ne pas reprendre un montant
   * déjà versé automatiquement).
   */
  static async reverseForTransaction(transactionId: string): Promise<void> {
    const conversion = await AffiliateConversionModel.findOne({ transaction: transactionId });
    if (!conversion) return;
    if (conversion.status === CommissionStatus.PAID) {
      logger.warn(
        { transactionId },
        'Remboursement sur une transaction dont la commission est déjà PAID — intervention admin requise',
      );
      return;
    }
    if (conversion.status === CommissionStatus.REVERSED) return;

    const wasApproved = conversion.status === CommissionStatus.APPROVED;

    conversion.status = CommissionStatus.REVERSED;
    await conversion.save();

    await AffiliateModel.findByIdAndUpdate(conversion.affiliate, {
      $inc: {
        pendingCommission: wasApproved ? 0 : -conversion.commissionAmount,
        totalConversions: -1,
        totalRevenue: -conversion.orderAmount,
      },
    });

    await AuditService.log({
      actor: null,
      action: 'affiliate.commission_reversed',
      entityType: 'AffiliateConversion',
      entityId: String(conversion._id),
    });
  }
}
