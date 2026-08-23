import { TransactionState, ListingStatus, AccessStatus, AttributionType } from '@gm/types';
import { generatePaymentReference } from '@gm/utils';
import { computeFee, DEFAULT_FEE_RULE } from '@gm/config';
import { splitAmount } from '@gm/utils';
import { AppError } from '../../lib/errors/app-error.js';
import { ErrorCode } from '../../lib/errors/error-codes.js';
import { ListingModel } from '../listings/listing.model.js';
import { GameModel } from '../games/game.model.js';
import { TransactionModel } from './transaction.model.js';
import { assertTransition, type Actor } from './transaction-state-machine.js';
import { SecureAccountAccessService } from './secure-account-access.service.js';
import { AuditService } from '../audit/audit.service.js';
import { AffiliateCommissionService } from '../affiliates/affiliate-commission.service.js';
import { AffiliateAttributionService } from '../affiliates/affiliate-attribution.service.js';
import { PromoCodeService } from '../affiliates/promo-code.service.js';

function requireParticipant(
  transaction: { buyer: unknown; seller: unknown },
  userId: string,
): Actor {
  if (String(transaction.buyer) === userId) return 'BUYER';
  if (String(transaction.seller) === userId) return 'SELLER';
  throw AppError.forbidden("Vous n'êtes pas partie prenante de cette transaction");
}

export class TransactionsService {
  static async createFromListing(input: {
    listingId: string;
    buyerId: string;
    promoCode?: string;
    sessionId?: string;
  }) {
    const listing = await ListingModel.findById(input.listingId);
    if (!listing) {
      throw AppError.notFound(ErrorCode.LISTING_NOT_FOUND, 'Annonce introuvable');
    }
    if (listing.status !== ListingStatus.PUBLISHED) {
      throw new AppError(
        ErrorCode.LISTING_NOT_PUBLISHABLE,
        "Cette annonce n'est pas disponible à l'achat",
        409,
      );
    }
    if (String(listing.seller) === input.buyerId) {
      throw AppError.forbidden('Vous ne pouvez pas acheter votre propre annonce');
    }

    const game = await GameModel.findById(listing.game);
    if (!game || !game.marketplaceEnabled) {
      throw new AppError(
        ErrorCode.GAME_MARKETPLACE_DISABLED,
        "Les transactions sur ce jeu sont actuellement désactivées",
        403,
      );
    }

    // Résolution de l'attribution affiliée (§7 — priorité stricte):
    // 1. code promo explicite, 2. attribution existante (compte/session).
    // Résolu ICI, au checkout, et porté par la transaction elle-même —
    // voir Transaction.attributedAffiliate (packages/types) pour la
    // justification.
    let discountAmount = 0;
    let attributedAffiliate: string | undefined;
    let attributionType: AttributionType | undefined;
    let appliedPromoCode: string | undefined;

    if (input.promoCode) {
      const applied = await PromoCodeService.validateAndApply({
        code: input.promoCode,
        orderAmount: listing.price,
        userId: input.buyerId,
      });
      discountAmount = applied.discountAmount;
      appliedPromoCode = applied.code;
      attributionType = AttributionType.PROMO_CODE;
      attributedAffiliate = applied.affiliateId;
      await PromoCodeService.recordUsage(applied.code);
    } else {
      const resolved = await AffiliateAttributionService.resolveAttribution({
        sessionId: input.sessionId,
        userId: input.buyerId,
      });
      if (resolved) {
        attributedAffiliate = resolved.affiliateId;
        attributionType = resolved.attributionType;
      }
    }

    const netPrice = Math.max(0, listing.price - discountAmount);
    const platformFee = computeFee(netPrice, DEFAULT_FEE_RULE);
    const { sellerAmount } = splitAmount(netPrice, platformFee);

    const transaction = await TransactionModel.create({
      buyer: input.buyerId,
      seller: listing.seller,
      listing: listing._id,
      amount: netPrice,
      currency: listing.currency,
      platformFee,
      sellerAmount,
      paymentReference: generatePaymentReference(),
      attributedAffiliate,
      attributionType,
      appliedPromoCode,
      discountAmount,
      stateHistory: [
        {
          from: TransactionState.CREATED,
          to: TransactionState.CREATED,
          at: new Date(),
          actor: 'SYSTEM',
        },
      ],
    });

    listing.status = ListingStatus.RESERVED;
    await listing.save();

    await AuditService.log({
      actor: input.buyerId,
      action: 'transaction.created',
      entityType: 'Transaction',
      entityId: String(transaction._id),
    });

    return transaction;
  }

  static async deliver(input: {
    transactionId: string;
    sellerId: string;
    credentialsPlaintext: string;
  }) {
    const transaction = await TransactionModel.findById(input.transactionId);
    if (!transaction) {
      throw AppError.notFound(ErrorCode.TRANSACTION_NOT_FOUND, 'Transaction introuvable');
    }
    const actor = requireParticipant(transaction, input.sellerId);
    if (actor !== 'SELLER') {
      throw AppError.forbidden('Seul le vendeur peut livrer les accès');
    }

    assertTransition(
      transaction.escrowStatus as TransactionState,
      TransactionState.SELLER_DELIVERED,
      'SELLER',
    );

    const { credentialId } = await SecureAccountAccessService.storeCredentials({
      listingId: String(transaction.listing),
      sellerId: input.sellerId,
      plaintext: input.credentialsPlaintext,
    });

    await SecureAccountAccessService.releaseToBuyer({
      credentialId,
      transactionId: String(transaction._id),
    });

    transaction.stateHistory.push({
      from: transaction.escrowStatus,
      to: TransactionState.SELLER_DELIVERED,
      at: new Date(),
      actor: input.sellerId,
    });
    transaction.escrowStatus = TransactionState.SELLER_DELIVERED;
    await transaction.save();

    // Transition automatique vers BUYER_REVIEWING: l'acheteur peut désormais
    // consulter les accès et a une fenêtre pour confirmer ou contester.
    transaction.stateHistory.push({
      from: transaction.escrowStatus,
      to: TransactionState.BUYER_REVIEWING,
      at: new Date(),
      actor: 'SYSTEM',
    });
    transaction.escrowStatus = TransactionState.BUYER_REVIEWING;
    await transaction.save();

    await AuditService.log({
      actor: input.sellerId,
      action: 'transaction.delivered',
      entityType: 'Transaction',
      entityId: String(transaction._id),
    });

    return transaction;
  }

  static async confirm(input: { transactionId: string; buyerId: string }) {
    const transaction = await TransactionModel.findById(input.transactionId);
    if (!transaction) {
      throw AppError.notFound(ErrorCode.TRANSACTION_NOT_FOUND, 'Transaction introuvable');
    }
    const actor = requireParticipant(transaction, input.buyerId);
    if (actor !== 'BUYER') {
      throw AppError.forbidden("Seul l'acheteur peut confirmer la transaction");
    }

    assertTransition(
      transaction.escrowStatus as TransactionState,
      TransactionState.COMPLETED,
      'BUYER',
    );

    transaction.stateHistory.push({
      from: transaction.escrowStatus,
      to: TransactionState.COMPLETED,
      at: new Date(),
      actor: input.buyerId,
    });
    transaction.escrowStatus = TransactionState.COMPLETED;
    transaction.buyerConfirmationAt = new Date();
    await transaction.save();

    await ListingModel.findByIdAndUpdate(transaction.listing, { status: ListingStatus.SOLD });

    await AffiliateCommissionService.approveForTransaction(String(transaction._id));

    await AuditService.log({
      actor: input.buyerId,
      action: 'transaction.completed',
      entityType: 'Transaction',
      entityId: String(transaction._id),
    });

    // Note Phase 5: le payout vendeur réel (transfert Mobile Money) est une
    // action applicative distincte à déclencher ici ou en job asynchrone —
    // pas un simple changement de statut, puisque le séquestre est
    // purement logique (voir docs/PAYMENTS.md). PayDunya propose une API
    // "Paiement Et Redistribution (PER)" qui pourrait automatiser ce
    // transfert SI le vendeur a lui-même un compte PayDunya — à évaluer en
    // Phase 5, non implémenté pour l'instant (workflow manuel via
    // AffiliatePayoutModel-like pattern, à créer pour les vendeurs).
    return transaction;
  }

  static async getById(transactionId: string, userId: string, isAdmin: boolean) {
    const transaction = await TransactionModel.findById(transactionId);
    if (!transaction) {
      throw AppError.notFound(ErrorCode.TRANSACTION_NOT_FOUND, 'Transaction introuvable');
    }
    if (!isAdmin) {
      requireParticipant(transaction, userId);
    }
    return transaction;
  }

  /**
   * Action admin: transaction en litige -> remboursement acheteur.
   * Inverse systématiquement toute commission affiliée associée (§12/§31).
   * Note Phase 5: le remboursement réel (transfert effectif vers
   * l'acheteur) est une action opérationnelle distincte à déclencher en
   * parallèle — non automatisée ici. PayDunya ne documente pas de
   * mécanisme de remboursement automatique universel pour tous les moyens
   * Mobile Money — à vérifier avec leur support technique
   * (tech@paydunya.com) avant d'automatiser, voir docs/PAYMENTS.md.
   */
  static async adminRefund(input: { transactionId: string; adminId: string; reason: string }) {
    const transaction = await TransactionModel.findById(input.transactionId);
    if (!transaction) {
      throw AppError.notFound(ErrorCode.TRANSACTION_NOT_FOUND, 'Transaction introuvable');
    }

    assertTransition(
      transaction.escrowStatus as TransactionState,
      TransactionState.REFUND_PENDING,
      'ADMIN',
    );
    transaction.stateHistory.push({
      from: transaction.escrowStatus,
      to: TransactionState.REFUND_PENDING,
      at: new Date(),
      actor: input.adminId,
    });
    transaction.escrowStatus = TransactionState.REFUND_PENDING;
    await transaction.save();

    assertTransition(
      transaction.escrowStatus as TransactionState,
      TransactionState.REFUNDED,
      'ADMIN',
    );
    transaction.stateHistory.push({
      from: transaction.escrowStatus,
      to: TransactionState.REFUNDED,
      at: new Date(),
      actor: input.adminId,
    });
    transaction.escrowStatus = TransactionState.REFUNDED;
    await transaction.save();

    await AffiliateCommissionService.reverseForTransaction(String(transaction._id));

    await AuditService.log({
      actor: input.adminId,
      action: 'transaction.refunded',
      entityType: 'Transaction',
      entityId: String(transaction._id),
      metadata: { reason: input.reason },
    });

    return transaction;
  }

  /**
   * Action admin: litige tranché en faveur du vendeur — le vendeur reçoit
   * son payout, la transaction est complétée. Miroir exact d'adminRefund:
   * approuve les commissions affiliées associées et marque l'annonce SOLD.
   * Le transfert Mobile Money réel reste une action opérationnelle distincte
   * (même logique que adminRefund, voir docs/PAYMENTS.md).
   */
  static async adminReleaseToSeller(input: {
    transactionId: string;
    adminId: string;
    reason: string;
  }) {
    const transaction = await TransactionModel.findById(input.transactionId);
    if (!transaction) {
      throw AppError.notFound(ErrorCode.TRANSACTION_NOT_FOUND, 'Transaction introuvable');
    }

    assertTransition(
      transaction.escrowStatus as TransactionState,
      TransactionState.SELLER_PAYOUT_PENDING,
      'ADMIN',
    );
    transaction.stateHistory.push({
      from: transaction.escrowStatus,
      to: TransactionState.SELLER_PAYOUT_PENDING,
      at: new Date(),
      actor: input.adminId,
    });
    transaction.escrowStatus = TransactionState.SELLER_PAYOUT_PENDING;
    await transaction.save();

    assertTransition(
      transaction.escrowStatus as TransactionState,
      TransactionState.COMPLETED,
      'ADMIN',
    );
    transaction.stateHistory.push({
      from: transaction.escrowStatus,
      to: TransactionState.COMPLETED,
      at: new Date(),
      actor: input.adminId,
    });
    transaction.escrowStatus = TransactionState.COMPLETED;
    await transaction.save();

    await ListingModel.findByIdAndUpdate(transaction.listing, { status: ListingStatus.SOLD });

    await AffiliateCommissionService.approveForTransaction(String(transaction._id));

    await AuditService.log({
      actor: input.adminId,
      action: 'transaction.released_to_seller',
      entityType: 'Transaction',
      entityId: String(transaction._id),
      metadata: { reason: input.reason },
    });

    return transaction;
  }

  static async listMine(userId: string) {
    return TransactionModel.find({ $or: [{ buyer: userId }, { seller: userId }] })
      .sort({ createdAt: -1 })
      .limit(100);
  }
}
