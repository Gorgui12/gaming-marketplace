import { PaymentStatus, TransactionState, ListingStatus, type AttributionType } from '@gm/types';
import { generatePaymentReference } from '@gm/utils';
import { AppError } from '../../lib/errors/app-error.js';
import { ErrorCode } from '../../lib/errors/error-codes.js';
import { logger } from '../../lib/logger.js';
import type { HydratedDocument } from 'mongoose';
import { TransactionModel, type TransactionDocument } from '../transactions/transaction.model.js';
import { ListingModel } from '../listings/listing.model.js';
import { assertTransition } from '../transactions/transaction-state-machine.js';
import { PayDunyaProvider } from './providers/paydunya.provider.js';
import type {
  PaymentProvider,
  ProviderPaymentStatus,
  WebhookEvent,
} from './providers/payment-provider.interface.js';
import { PaymentEventModel } from './payment-event.model.js';
import { env } from '../../config/env.js';
import { AffiliateCommissionService } from '../affiliates/affiliate-commission.service.js';

// Point unique de sélection du provider actif. Ajouter un nouveau provider
// (Stripe, Paddle...) = créer une classe qui implémente PaymentProvider et
// changer cette ligne, sans toucher au reste du système transactionnel.
const provider: PaymentProvider = new PayDunyaProvider();

export class PaymentService {
  static async initiateForTransaction(input: {
    transactionId: string;
    buyerName: string;
    buyerEmail: string;
    buyerPhone?: string;
    returnUrl: string;
  }): Promise<{ paymentUrl: string }> {
    const transaction = await TransactionModel.findById(input.transactionId);
    if (!transaction) {
      throw AppError.notFound(ErrorCode.TRANSACTION_NOT_FOUND, 'Transaction introuvable');
    }

    assertTransition(
      transaction.escrowStatus as TransactionState,
      TransactionState.PAYMENT_PENDING,
      'SYSTEM',
    );

    const reference = transaction.paymentReference || generatePaymentReference();

    let result;
    try {
      result = await provider.initiatePayment({
        amount: transaction.amount,
        currency: transaction.currency,
        reference,
        description: `Achat compte gaming — réf ${reference}`,
        customer: { name: input.buyerName, email: input.buyerEmail, phone: input.buyerPhone },
        returnUrl: input.returnUrl,
        notifyUrl: `${env.API_PUBLIC_URL}${env.PAYDUNYA_IPN_PATH}`,
      });
    } catch (err) {
      // L'annonce a été réservée à la création de la transaction
      // (TransactionsService.createFromListing). Si l'initiation du paiement
      // échoue, aucun IPN ne viendra jamais — sans rollback, l'annonce reste
      // bloquée en RESERVED et la page détail renvoie 404 pour toujours.
      transaction.stateHistory.push({
        from: transaction.escrowStatus,
        to: TransactionState.CANCELLED,
        at: new Date(),
        actor: 'SYSTEM',
      });
      transaction.escrowStatus = TransactionState.CANCELLED;
      await transaction.save().catch(() => {});
      await ListingModel.updateOne(
        { _id: transaction.listing, status: ListingStatus.RESERVED },
        { $set: { status: ListingStatus.PUBLISHED } },
      ).catch(() => {});
      throw err;
    }

    transaction.paymentReference = reference;
    // Token PayDunya conservé pour permettre une vérification active
    // (invoice.confirm) en secours si l'IPN n'arrive jamais.
    transaction.providerTransactionId = result.providerTransactionId;
    transaction.stateHistory.push({
      from: transaction.escrowStatus,
      to: TransactionState.PAYMENT_PENDING,
      at: new Date(),
      actor: 'SYSTEM',
    });
    transaction.escrowStatus = TransactionState.PAYMENT_PENDING;
    await transaction.save();

    return { paymentUrl: result.paymentUrl };
  }

  /**
   * Vérification active auprès du provider — filet de sécurité si l'IPN
   * n'arrive jamais (tunnel ngrok coupé, latence, incident provider).
   * Déclenchée quand l'acheteur revient de la page de paiement PayDunya
   * (usage documenté de invoice.confirm()). Le statut retourné vient
   * EXCLUSIVEMENT de l'API PayDunya via le token stocké côté serveur à
   * l'initiation — l'appelant ne peut donc pas forger un état.
   */
  static async syncPaymentStatus(input: {
    transactionId: string;
    userId: string;
  }): Promise<{ transaction: HydratedDocument<TransactionDocument>; synced: boolean }> {
    const transaction = await TransactionModel.findById(input.transactionId);
    if (!transaction) {
      throw AppError.notFound(ErrorCode.TRANSACTION_NOT_FOUND, 'Transaction introuvable');
    }
    if (String(transaction.buyer) !== input.userId) {
      throw AppError.forbidden("Seul l'acheteur peut vérifier le paiement");
    }

    // Déjà avancée (IPN reçu entre-temps) : rien à faire.
    if (transaction.escrowStatus !== TransactionState.PAYMENT_PENDING) {
      return { transaction, synced: false };
    }
    if (!transaction.providerTransactionId) {
      logger.warn(
        { transactionId: transaction._id },
        'Vérification impossible: providerTransactionId absent',
      );
      return { transaction, synced: false };
    }

    const status = await provider.verifyTransaction(transaction.providerTransactionId);
    await this.applyPaymentConfirmation(transaction, status);
    return { transaction, synced: true };
  }

  /**
   * Traite un webhook entrant de façon idempotente:
   * 1. tente d'insérer un PaymentEvent avec providerEventId unique
   * 2. si duplicate key -> déjà traité, on retourne sans ré-exécuter la logique
   * 3. sinon on avance la transaction (PAYMENT_CONFIRMED -> ESCROW_ACTIVE)
   */
  static async handleWebhook(
    rawBody: unknown,
    headers: Record<string, string | string[] | undefined>,
  ): Promise<void> {
    const event: WebhookEvent = await provider.parseWebhook(rawBody, headers);

    const transaction = await TransactionModel.findOne({ paymentReference: event.reference });
    if (!transaction) {
      logger.warn({ reference: event.reference }, 'Webhook reçu pour transaction inconnue');
      return;
    }

    try {
      await PaymentEventModel.create({
        transaction: transaction._id,
        provider: 'paydunya',
        providerEventId: event.providerEventId,
        rawPayload: event.rawPayload,
      });
    } catch (err: unknown) {
      if (isDuplicateKeyError(err)) {
        logger.info({ providerEventId: event.providerEventId }, 'Webhook déjà traité, ignoré');
        return;
      }
      throw err;
    }

    await this.applyPaymentConfirmation(transaction, event.status);
  }

  /**
   * Logique partagée IPN / vérification active: applique un statut provider
   * sur une transaction en PAYMENT_PENDING. Idempotente ET atomique — le
   * verrou est posé par MongoDB lui-même via findOneAndUpdate filtré sur
   * escrowStatus, pas par une lecture-puis-écriture en mémoire. Ça empêche
   * un IPN et une vérification active (ou deux appels concurrents) de
   * progresser tous les deux la state machine en parallèle.
   */
  private static async applyPaymentConfirmation(
    transaction: HydratedDocument<TransactionDocument>,
    status: ProviderPaymentStatus,
  ): Promise<void> {
    if (status !== 'CONFIRMED') {
      transaction.paymentStatus = PaymentStatus.FAILED;
      await transaction.save();
      return;
    }

    // Verrou atomique: seul l'appelant qui matche encore PAYMENT_PENDING au
    // moment exact de l'update MongoDB gagne la course. L'autre appelant
    // concurrent (IPN vs vérification active, ou deux syncs simultanés)
    // reçoit `null` et s'arrête proprement sans rien modifier.
    const locked = await TransactionModel.findOneAndUpdate(
      { _id: transaction._id, escrowStatus: TransactionState.PAYMENT_PENDING },
      {
        $set: {
          paymentStatus: PaymentStatus.CONFIRMED,
          escrowStatus: TransactionState.PAYMENT_CONFIRMED,
        },
        $push: {
          stateHistory: {
            from: TransactionState.PAYMENT_PENDING,
            to: TransactionState.PAYMENT_CONFIRMED,
            at: new Date(),
            actor: 'SYSTEM',
          },
        },
      },
      { new: true },
    );

    if (!locked) {
      // Un autre appel a déjà gagné la course (sécurité supplémentaire
      // au-delà de l'index unique providerEventId côté IPN).
      logger.info(
        { transactionId: transaction._id },
        'Statut provider ignoré: transaction déjà avancée par un autre appel concurrent',
      );
      return;
    }

    // Transition immédiate vers ESCROW_ACTIVE: à ce stade la plateforme a
    // reçu le paiement (statut logique de séquestre — voir docs/PAYMENTS.md).
    // Pas de risque de concurrence ici: seul l'appelant qui a gagné le
    // verrou ci-dessus atteint cette ligne.
    locked.stateHistory.push({
      from: TransactionState.PAYMENT_CONFIRMED,
      to: TransactionState.ESCROW_ACTIVE,
      at: new Date(),
      actor: 'SYSTEM',
    });
    locked.escrowStatus = TransactionState.ESCROW_ACTIVE;
    await locked.save();

    // §31 — hook affiliation: strictement après la confirmation du
    // paiement, découplé du PaymentProvider (§37). Ne fait rien si la
    // transaction n'a pas d'attribution résolue au checkout.
    if (locked.attributedAffiliate) {
      await AffiliateCommissionService.createConversionIfAttributed(
        {
          _id: locked._id,
          buyer: locked.buyer,
          amount: locked.amount,
          sellerAmount: locked.sellerAmount,
          platformFee: locked.platformFee,
          currency: locked.currency,
        },
        {
          affiliateId: String(locked.attributedAffiliate),
          attributionType: locked.attributionType as AttributionType,
          promoCode: locked.appliedPromoCode ?? undefined,
          discountAmount: locked.discountAmount ?? undefined,
        },
      );
    }
  }
}

function isDuplicateKeyError(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: number }).code === 11000;
}
