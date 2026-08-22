import { AccessStatus, TransactionState } from '@gm/types';
import { AppError } from '../../lib/errors/app-error.js';
import { ErrorCode } from '../../lib/errors/error-codes.js';
import { SecureAccountCredentialModel } from './secure-account-credential.model.js';
import { TransactionModel } from './transaction.model.js';
import { encryptCredentials, decryptCredentials } from './credential-encryption.js';
import { logger } from '../../lib/logger.js';

/**
 * Seul point d'accès autorisé aux identifiants de compte gaming.
 *
 * Règles non négociables:
 * - stockCredentials() n'est appelé qu'au moment de la livraison
 *   (SELLER_DELIVERED), jamais avant.
 * - releaseCredentials() ne peut être appelé QUE si la transaction associée
 *   est en ESCROW_ACTIVE ou SELLER_DELIVERED — jamais avant paiement confirmé.
 * - Le payload en clair ne transite jamais par un log (voir logger.ts,
 *   redaction sur credentialsPayload).
 * - invalidate() est appelé après COMPLETED ou REFUNDED pour empêcher toute
 *   relecture ultérieure.
 */
export class SecureAccountAccessService {
  static async storeCredentials(input: {
    listingId: string;
    sellerId: string;
    plaintext: string;
  }): Promise<{ credentialId: string }> {
    const encrypted = encryptCredentials(input.plaintext);
    const doc = await SecureAccountCredentialModel.create({
      listing: input.listingId,
      seller: input.sellerId,
      encryptedPayload: encrypted.ciphertext,
      encryptionIv: encrypted.iv,
      encryptionAuthTag: encrypted.authTag,
    });
    logger.info({ listingId: input.listingId, credentialId: doc._id }, 'Credentials stockées');
    return { credentialId: String(doc._id) };
  }

  static async releaseToBuyer(input: {
    credentialId: string;
    transactionId: string;
  }): Promise<{ plaintext: string }> {
    const transaction = await TransactionModel.findById(input.transactionId);
    if (!transaction) {
      throw AppError.notFound(ErrorCode.TRANSACTION_NOT_FOUND, 'Transaction introuvable');
    }

    const releasableStates: string[] = [
      TransactionState.ESCROW_ACTIVE,
      TransactionState.SELLER_DELIVERED,
      TransactionState.BUYER_REVIEWING,
    ];
    if (!releasableStates.includes(transaction.escrowStatus)) {
      throw new AppError(
        ErrorCode.ACCESS_NOT_YET_RELEASABLE,
        "L'accès ne peut pas être libéré dans l'état actuel de la transaction",
        409,
      );
    }

    const credential = await SecureAccountCredentialModel.findById(input.credentialId).select(
      '+encryptedPayload +encryptionIv +encryptionAuthTag',
    );
    if (!credential) {
      throw AppError.notFound(ErrorCode.NOT_FOUND, 'Identifiants introuvables');
    }
    if (credential.invalidatedAt) {
      throw new AppError(ErrorCode.FORBIDDEN, 'Ces identifiants ont été invalidés', 410);
    }

    const plaintext = decryptCredentials({
      ciphertext: credential.encryptedPayload,
      iv: credential.encryptionIv,
      authTag: credential.encryptionAuthTag,
    });

    credential.releasedToTransaction = transaction._id;
    credential.releasedAt = new Date();
    await credential.save();

    transaction.accessStatus = AccessStatus.RELEASED;
    await transaction.save();

    return { plaintext };
  }

    /**
   * Lecture à la demande par l'acheteur — ne stocke jamais le clair, on
   * redéchiffre à chaque appel depuis SecureAccountCredentialModel. Exige
   * que la libération ait déjà eu lieu (accessStatus RELEASED) et que
   * l'appelant soit bien l'acheteur de la transaction concernée.
   */
  static async getForBuyer(input: {
    transactionId: string;
    buyerId: string;
  }): Promise<{ plaintext: string }> {
    const transaction = await TransactionModel.findById(input.transactionId);
    if (!transaction) {
      throw AppError.notFound(ErrorCode.TRANSACTION_NOT_FOUND, 'Transaction introuvable');
    }
    if (String(transaction.buyer) !== input.buyerId) {
      throw AppError.forbidden("Vous n'êtes pas l'acheteur de cette transaction");
    }
    if (transaction.accessStatus !== AccessStatus.RELEASED) {
      throw new AppError(
        ErrorCode.ACCESS_NOT_YET_RELEASABLE,
        "Le vendeur n'a pas encore livré les accès",
        409,
      );
    }

    const credential = await SecureAccountCredentialModel.findOne({
      releasedToTransaction: transaction._id,
    }).select('+encryptedPayload +encryptionIv +encryptionAuthTag');
    if (!credential) {
      throw AppError.notFound(ErrorCode.NOT_FOUND, 'Identifiants introuvables');
    }
    if (credential.invalidatedAt) {
      throw new AppError(ErrorCode.FORBIDDEN, 'Ces identifiants ont été invalidés', 410);
    }

    const plaintext = decryptCredentials({
      ciphertext: credential.encryptedPayload,
      iv: credential.encryptionIv,
      authTag: credential.encryptionAuthTag,
    });

    return { plaintext };
  }

  static async invalidate(credentialId: string): Promise<void> {
    await SecureAccountCredentialModel.findByIdAndUpdate(credentialId, {
      invalidatedAt: new Date(),
    });
  }
}
