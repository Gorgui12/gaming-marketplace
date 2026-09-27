import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AccessStatus, ListingStatus, TransactionState, PaymentStatus } from '@gm/types';
import { createFakeModel } from './helpers/fake-model.js';
import { SecureAccountAccessService } from '../src/modules/transactions/secure-account-access.service.js';
import { DisputesService } from '../src/modules/disputes/disputes.service.js';

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
    invalidateForTransaction: vi.fn().mockResolvedValue(undefined),
  },
}));
// DisputesService est appelé par adminRefund/adminReleaseToSeller : c'est lui
// qui solde le document Dispute. Mocké pour que ce test porte bien sur les
// transitions de transaction (le comportement de clôture est testé dans
// disputes.service.test.ts).
vi.mock('../src/modules/disputes/disputes.service.js', () => ({
  DisputesService: { closeForTransaction: vi.fn().mockResolvedValue(null) },
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
    sendTransactionPaymentFailed: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('../src/modules/notifications/notification.service.js', () => ({
  NotificationService: { create: vi.fn().mockResolvedValue(undefined) },
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

describe('TransactionsService.adminCancelPendingPayment', () => {
  beforeEach(() => {
    fakeListingModel.__reset();
    fakeGameModel.__reset();
    fakeTransactionModel.__reset();
    vi.clearAllMocks();
  });

  it("annule une transaction PAYMENT_PENDING et libère l'annonce (PUBLISHED)", async () => {
    const listing = await fakeListingModel.create({
      seller: 'seller-1',
      game: 'game-1',
      price: 30_000,
      currency: 'XOF',
      status: ListingStatus.RESERVED,
    });
    const txn = await fakeTransactionModel.create({
      buyer: 'buyer-1',
      seller: 'seller-1',
      listing: listing._id,
      escrowStatus: TransactionState.PAYMENT_PENDING,
      stateHistory: [],
    });

    const result = await TransactionsService.adminCancelPendingPayment({
      transactionId: txn._id,
      adminId: 'admin-1',
      reason: 'test manuel',
    });

    expect(result.escrowStatus).toBe(TransactionState.CANCELLED);
    expect(result.paymentStatus).toBe(PaymentStatus.FAILED);

    const updatedListing = await fakeListingModel.findById(listing._id);
    expect(updatedListing!.status).toBe(ListingStatus.PUBLISHED);
  });

  it("n'efface pas une annonce qui a déjà été libérée (non-RESERVED)", async () => {
    const listing = await fakeListingModel.create({
      seller: 'seller-1',
      game: 'game-1',
      price: 30_000,
      currency: 'XOF',
      status: ListingStatus.SOLD,
    });
    const txn = await fakeTransactionModel.create({
      buyer: 'buyer-1',
      seller: 'seller-1',
      listing: listing._id,
      escrowStatus: TransactionState.PAYMENT_PENDING,
      stateHistory: [],
    });

    await TransactionsService.adminCancelPendingPayment({
      transactionId: txn._id,
      adminId: 'admin-1',
      reason: 'test',
    });

    const updatedListing = await fakeListingModel.findById(listing._id);
    expect(updatedListing!.status).toBe(ListingStatus.SOLD);
  });

  it("refuse d'annuler une transaction hors PAYMENT_PENDING", async () => {
    const txn = await fakeTransactionModel.create({
      buyer: 'buyer-1',
      seller: 'seller-1',
      escrowStatus: TransactionState.ESCROW_ACTIVE,
      listing: 'listing-1',
      stateHistory: [],
    });

    await expect(
      TransactionsService.adminCancelPendingPayment({
        transactionId: txn._id,
        adminId: 'admin-1',
        reason: 'test',
      }),
    ).rejects.toThrow();
  });
});

describe('TransactionsService.adminRefund — revocation des accès', () => {
  beforeEach(() => {
    fakeListingModel.__reset();
    fakeGameModel.__reset();
    fakeTransactionModel.__reset();
    vi.clearAllMocks();
  });

  async function seedDisputed(accessStatus: string) {
    const { listing } = await setupPublishedListing();
    return fakeTransactionModel.create({
      buyer: 'buyer-1',
      seller: 'seller-1',
      listing: listing._id,
      amount: 50_000,
      currency: 'XOF',
      escrowStatus: TransactionState.DISPUTED,
      disputeStatus: 'open',
      accessStatus,
      stateHistory: [],
    });
  }

  it("invalide les accès déjà livrés et solde le litige ouvert", async () => {
    const txn = await seedDisputed('RELEASED');

    await TransactionsService.adminRefund({
      transactionId: txn._id,
      adminId: 'admin-1',
      reason: 'Compte ne fonctionne pas',
      disputeResolution: 'Compte vendu non conforme',
    });

    // L'acheteur est remboursé : il ne doit plus pouvoir relire les
    // identifiants du compte qu'il vient de se faire rembourser.
    expect(SecureAccountAccessService.invalidateForTransaction).toHaveBeenCalledWith(txn._id);
    const stored = await fakeTransactionModel.findById(txn._id);
    expect(stored!.accessStatus).toBe(AccessStatus.INVALIDATED);
    expect(stored!.disputeStatus).toBe('resolved');

    // Le libellé de décision, et non la raison technique, alimente le litige.
    expect(DisputesService.closeForTransaction).toHaveBeenCalledWith({
      transactionId: txn._id,
      outcome: 'BUYER',
      resolution: 'Compte vendu non conforme',
      adminId: 'admin-1',
    });
  });

  it("préserve NOT_RELEASED si le vendeur n'a jamais livré (pas de faux indice d'audit)", async () => {
    const txn = await seedDisputed('NOT_RELEASED');

    await TransactionsService.adminRefund({
      transactionId: txn._id,
      adminId: 'admin-1',
      reason: 'Litige avant livraison',
    });

    // Écraser en INVALIDATED dirait à tort à l'admin que le vendeur avait
    // livré des accès. Sûreté assurée ailleurs : getForBuyer refuse sur
    // escrowStatus REFUNDED quel que soit accessStatus.
    expect(SecureAccountAccessService.invalidateForTransaction).not.toHaveBeenCalled();
    const stored = await fakeTransactionModel.findById(txn._id);
    expect(stored!.accessStatus).toBe('NOT_RELEASED');
  });

  it("reutilise la raison technique quand l'appel ne vient pas d'un litige", async () => {
    const txn = await seedDisputed('NOT_RELEASED');

    await TransactionsService.adminRefund({
      transactionId: txn._id,
      adminId: 'admin-1',
      reason: 'Remboursement goodwill',
    });

    expect(DisputesService.closeForTransaction).toHaveBeenCalledWith(
      expect.objectContaining({ resolution: 'Remboursement goodwill', outcome: 'BUYER' }),
    );
  });
});

describe('TransactionsService.adminReleaseToSeller', () => {
  beforeEach(() => {
    fakeListingModel.__reset();
    fakeGameModel.__reset();
    fakeTransactionModel.__reset();
    vi.clearAllMocks();
  });

  it("ne révoque PAS les accès : l'acheteur garde son compte légitime", async () => {
    const { listing } = await setupPublishedListing();
    const txn = await fakeTransactionModel.create({
      buyer: 'buyer-1',
      seller: 'seller-1',
      listing: listing._id,
      amount: 50_000,
      currency: 'XOF',
      escrowStatus: TransactionState.DISPUTED,
      disputeStatus: 'open',
      accessStatus: 'RELEASED',
      stateHistory: [],
    });

    await TransactionsService.adminReleaseToSeller({
      transactionId: txn._id,
      adminId: 'admin-1',
      reason: 'Compte conforme',
      disputeResolution: 'Litige rejeté',
    });

    expect(SecureAccountAccessService.invalidateForTransaction).not.toHaveBeenCalled();
    const stored = await fakeTransactionModel.findById(txn._id);
    expect(stored!.escrowStatus).toBe(TransactionState.COMPLETED);
    expect(stored!.accessStatus).toBe('RELEASED');
    expect(DisputesService.closeForTransaction).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: 'SELLER', resolution: 'Litige rejeté' }),
    );
  });
});
