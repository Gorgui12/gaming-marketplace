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
 * - invalidateForTransaction() est appelé dès que la transaction part en
 *   REFUNDED, pour couper toute relecture des identifiants par un acheteur
 *   qui n'a plus le droit de les conserver.
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
   * que la libération ait déjà eu lieu (accessStatus RELEASED) ET que la
   * transaction ne soit pas dans un état qui retire le droit à l'acheteur.
   *
   * Le contrôle de l'état de la transaction est indispensable, et pas une
   * redondance avec `accessStatus` : après un remboursement de litige, la
   * transaction part en REFUNDED alors que l'accès avait déjà été libéré et
   * reste marqué RELEASED en base. Sans ce garde-fou, l'acheteur relisait
   * indéfiniment les identifiants d'un compte pour lequel il vient d'être
   * remboursé.
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
    // États qui retirent le droit de conservation des accès à l'acheteur.
    const accessRevokedStates: string[] = [
      TransactionState.REFUNDED,
      TransactionState.REFUND_PENDING,
      TransactionState.DISPUTED,
      TransactionState.CANCELLED,
    ];
    if (accessRevokedStates.includes(transaction.escrowStatus as string)) {
      throw new AppError(
        ErrorCode.FORBIDDEN,
        "Les accès de cette transaction ne sont plus consultables (transaction " +
          `${transaction.escrowStatus.toLowerCase()})`,
        410,
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

  /**
   * Coupe l'accès aux identifiants d'une transaction
   * (remboursement, annulation). Idempotent, et sans effet si les accès n'ont
   * jamais été libérés — ce qui est le cas d'un remboursement avant livraison.
   */
  static async invalidateForTransaction(transactionId: string): Promise<void> {
    const result = await SecureAccountCredentialModel.updateMany(
      { releasedToTransaction: transactionId, invalidatedAt: null },
      { invalidatedAt: new Date() },
    );
    if (result.modifiedCount > 0) {
      logger.info(
        { transactionId, count: result.modifiedCount },
        'Accès invalidés après remboursement',
      );
    }
  }
}
