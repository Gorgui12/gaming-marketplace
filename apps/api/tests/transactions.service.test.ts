import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ListingStatus, TransactionState } from '@gm/types';
import { createFakeModel } from './helpers/fake-model.js';

const fakeListingModel = createFakeModel();
const fakeGameModel = createFakeModel();
const fakeTransactionModel = createFakeModel();

vi.mock('../src/modules/listings/listing.model.js', () => ({ ListingModel: fakeListingModel }));
vi.mock('../src/modules/games/game.model.js', () => ({ GameModel: fakeGameModel }));
vi.mock('../src/modules/transactions/transaction.model.js', () => ({
  TransactionModel: fakeTransactionModel,
}));
vi.mock('../src/modules/transactions/secure-account-access.service.js', () => ({
  SecureAccountAccessService: {
    storeCredentials: vi.fn().mockResolvedValue({ credentialId: 'cred-1' }),
    releaseToBuyer: vi.fn().mockResolvedValue({ plaintext: 'secret' }),
  },
}));
vi.mock('../src/modules/audit/audit.service.js', () => ({ AuditService: { log: vi.fn() } }));
vi.mock('../src/modules/affiliates/affiliate-commission.service.js', () => ({
  AffiliateCommissionService: { approveForTransaction: vi.fn(), reverseForTransaction: vi.fn() },
}));
vi.mock('../src/modules/affiliates/affiliate-attribution.service.js', () => ({
  AffiliateAttributionService: { resolveAttribution: vi.fn().mockResolvedValue(null) },
}));
vi.mock('../src/modules/affiliates/promo-code.service.js', () => ({
  PromoCodeService: { validateAndApply: vi.fn(), recordUsage: vi.fn() },
}));
// UserModel/EmailService: nouveaux appels introduits par les emails
// transactionnels — mockés pour isoler la logique testée et ne jamais
// déclencher de vrai envoi SMTP pendant les tests.
vi.mock('../src/modules/users/user.model.js', () => ({
  UserModel: {
    findById: vi.fn().mockReturnValue({
      select: vi.fn().mockResolvedValue({ email: 'test@example.com', firstName: 'Test' }),
    }),
  },
}));
vi.mock('../src/lib/email/email.service.js', () => ({
  EmailService: {
    sendTransactionCreated: vi.fn().mockResolvedValue(undefined),
    sendTransactionDelivered: vi.fn().mockResolvedValue(undefined),
    sendTransactionCompleted: vi.fn().mockResolvedValue(undefined),
    sendTransactionRefunded: vi.fn().mockResolvedValue(undefined),
  },
}));

const { TransactionsService } = await import(
  '../src/modules/transactions/transactions.service.js'
);

async function setupPublishedListing() {
  const game = await fakeGameModel.create({ marketplaceEnabled: true, active: true });
  const listing = await fakeListingModel.create({
    seller: 'seller-1',
    game: game._id,
    price: 50_000,
    currency: 'XOF',
    status: ListingStatus.PUBLISHED,
  });
  return { game, listing };
}

describe('TransactionsService.createFromListing', () => {
  beforeEach(() => {
    fakeListingModel.__reset();
    fakeGameModel.__reset();
    fakeTransactionModel.__reset();
    vi.clearAllMocks();
  });

  it('rejects when the buyer is the seller (cannot buy your own listing)', async () => {
    const { listing } = await setupPublishedListing();
    await expect(
      TransactionsService.createFromListing({ listingId: listing._id, buyerId: 'seller-1' }),
    ).rejects.toThrow(/propre annonce/);
  });

  it('rejects when the game marketplace is disabled (ToS kill-switch, §3)', async () => {
    const game = await fakeGameModel.create({ marketplaceEnabled: false, active: true });
    const listing = await fakeListingModel.create({
      seller: 'seller-1',
      game: game._id,
      price: 50_000,
      currency: 'XOF',
      status: ListingStatus.PUBLISHED,
    });

    await expect(
      TransactionsService.createFromListing({ listingId: listing._id, buyerId: 'buyer-1' }),
    ).rejects.toThrow(/désactivées/);
  });

  it('rejects when the listing is not PUBLISHED (e.g. already RESERVED)', async () => {
    const game = await fakeGameModel.create({ marketplaceEnabled: true, active: true });
    const listing = await fakeListingModel.create({
      seller: 'seller-1',
      game: game._id,
      price: 50_000,
      currency: 'XOF',
      status: ListingStatus.RESERVED,
    });

    await expect(
      TransactionsService.createFromListing({ listingId: listing._id, buyerId: 'buyer-1' }),
    ).rejects.toThrow(/disponible/);
  });

  it('creates a transaction with correct fee split and reserves the listing', async () => {
    const { listing } = await setupPublishedListing();

    const transaction = await TransactionsService.createFromListing({
      listingId: listing._id,
      buyerId: 'buyer-1',
    });

    expect(transaction.amount).toBe(50_000);
    expect(transaction.platformFee + transaction.sellerAmount).toBe(50_000);

    const updatedListing = await fakeListingModel.findById(listing._id);
    expect(updatedListing!.status).toBe(ListingStatus.RESERVED);
  });
});

describe('TransactionsService.deliver / confirm — participant authorization', () => {
  beforeEach(() => {
    fakeListingModel.__reset();
    fakeGameModel.__reset();
    fakeTransactionModel.__reset();
    vi.clearAllMocks();
  });

  it('rejects deliver() when the caller is not the seller of the transaction', async () => {
    const txn = await fakeTransactionModel.create({
      buyer: 'buyer-1',
      seller: 'seller-1',
      escrowStatus: TransactionState.ESCROW_ACTIVE,
      listing: 'listing-1',
      stateHistory: [],
    });

    await expect(
      TransactionsService.deliver({
        transactionId: txn._id,
        sellerId: 'buyer-1', // usurpe le rôle vendeur
        credentialsPlaintext: 'hacked',
      }),
    ).rejects.toThrow();
  });

  it('rejects confirm() when the caller is not the buyer of the transaction', async () => {
    const txn = await fakeTransactionModel.create({
      buyer: 'buyer-1',
      seller: 'seller-1',
      escrowStatus: TransactionState.BUYER_REVIEWING,
      listing: 'listing-1',
      stateHistory: [],
    });

    await expect(
      TransactionsService.confirm({ transactionId: txn._id, buyerId: 'seller-1' }),
    ).rejects.toThrow();
  });

  it('rejects any action from a user who is neither buyer nor seller', async () => {
    const txn = await fakeTransactionModel.create({
      buyer: 'buyer-1',
      seller: 'seller-1',
      escrowStatus: TransactionState.BUYER_REVIEWING,
      listing: 'listing-1',
      stateHistory: [],
    });

    await expect(
      TransactionsService.confirm({ transactionId: txn._id, buyerId: 'complete-stranger' }),
    ).rejects.toThrow();
  });
});
