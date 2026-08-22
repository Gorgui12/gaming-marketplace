import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TransactionState } from '@gm/types';
import { createFakeModel } from './helpers/fake-model.js';

const fakeTransactionModel = createFakeModel();
const fakeCredentialModel = createFakeModel();

vi.mock('../src/modules/transactions/transaction.model.js', () => ({
  TransactionModel: fakeTransactionModel,
}));
vi.mock('../src/modules/transactions/secure-account-credential.model.js', () => ({
  SecureAccountCredentialModel: fakeCredentialModel,
}));

const { SecureAccountAccessService } = await import(
  '../src/modules/transactions/secure-account-access.service.js'
);

describe('SecureAccountAccessService', () => {
  beforeEach(() => {
    fakeTransactionModel.__reset();
    fakeCredentialModel.__reset();
  });

  it('encrypts on store and decrypts back the exact same plaintext on release', async () => {
    const transaction = await fakeTransactionModel.create({
      escrowStatus: TransactionState.ESCROW_ACTIVE,
      buyer: 'buyer-1',
    });

    const { credentialId } = await SecureAccountAccessService.storeCredentials({
      listingId: 'listing-1',
      sellerId: 'seller-1',
      plaintext: 'user:gamer123 pass:s3cr3t!',
    });

    const { plaintext } = await SecureAccountAccessService.releaseToBuyer({
      credentialId,
      transactionId: transaction._id,
    });

    expect(plaintext).toBe('user:gamer123 pass:s3cr3t!');
  });

  it('rejects release when the transaction has not reached ESCROW_ACTIVE yet', async () => {
    const transaction = await fakeTransactionModel.create({
      escrowStatus: TransactionState.PAYMENT_CONFIRMED,
    });
    const { credentialId } = await SecureAccountAccessService.storeCredentials({
      listingId: 'listing-1',
      sellerId: 'seller-1',
      plaintext: 'secret',
    });

    await expect(
      SecureAccountAccessService.releaseToBuyer({
        credentialId,
        transactionId: transaction._id,
      }),
    ).rejects.toThrow(/état actuel/);
  });

  it('rejects release once credentials have been invalidated', async () => {
    const transaction = await fakeTransactionModel.create({
      escrowStatus: TransactionState.ESCROW_ACTIVE,
    });
    const { credentialId } = await SecureAccountAccessService.storeCredentials({
      listingId: 'listing-1',
      sellerId: 'seller-1',
      plaintext: 'secret',
    });

    await SecureAccountAccessService.invalidate(credentialId);

    await expect(
      SecureAccountAccessService.releaseToBuyer({
        credentialId,
        transactionId: transaction._id,
      }),
    ).rejects.toThrow(/invalidés/);
  });

  it('throws TRANSACTION_NOT_FOUND when releasing against an unknown transaction id', async () => {
    const { credentialId } = await SecureAccountAccessService.storeCredentials({
      listingId: 'listing-1',
      sellerId: 'seller-1',
      plaintext: 'secret',
    });

    await expect(
      SecureAccountAccessService.releaseToBuyer({
        credentialId,
        transactionId: 'does-not-exist',
      }),
    ).rejects.toThrow(/introuvable/);
  });
});
