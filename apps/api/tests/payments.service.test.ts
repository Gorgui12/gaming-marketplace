import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PaymentStatus, TransactionState } from '@gm/types';
import { createFakeModel } from './helpers/fake-model.js';

const fakeTransactionModel = createFakeModel();
const fakePaymentEventModel = createFakeModel();
const pristinePaymentEventCreate = fakePaymentEventModel.create.bind(fakePaymentEventModel);

// Le webhook PayDunya lui-même (hash, format IPN) est mocké ici — on ne
// teste pas l'intégration PayDunya réelle contre leurs vrais serveurs,
// seulement la logique d'idempotence et de progression de la transaction
// UNE FOIS l'event du provider parsé. Idem pour la vérification active
// (invoice.confirm) utilisée par syncPaymentStatus.
const parseWebhookMock = vi.fn();
const verifyTransactionMock = vi.fn();
vi.mock('../src/modules/payments/providers/paydunya.provider.js', () => ({
  PayDunyaProvider: vi.fn().mockImplementation(() => ({
    parseWebhook: parseWebhookMock,
    verifyTransaction: verifyTransactionMock,
  })),
}));

vi.mock('../src/modules/transactions/transaction.model.js', () => ({
  TransactionModel: fakeTransactionModel,
}));
vi.mock('../src/modules/payments/payment-event.model.js', () => ({
  PaymentEventModel: fakePaymentEventModel,
}));

const createConversionMock = vi.fn();
vi.mock('../src/modules/affiliates/affiliate-commission.service.js', () => ({
  AffiliateCommissionService: { createConversionIfAttributed: createConversionMock },
}));

const { PaymentService } = await import('../src/modules/payments/payments.service.js');

// PaymentEventModel.create doit lever une erreur de clé dupliquée (code
// 11000) au deuxième appel avec le même providerEventId — c'est le
// mécanisme réel d'idempotence (index unique Mongo), donc on le simule
// fidèlement plutôt que de le contourner.
function makeIdempotentCreate() {
  const seen = new Set<string>();
  return async (input: { providerEventId: string }) => {
    if (seen.has(input.providerEventId)) {
      fakePaymentEventModel.simulateDuplicateKeyError();
    }
    seen.add(input.providerEventId);
    return pristinePaymentEventCreate(input);
  };
}

describe('PaymentService.handleWebhook — idempotence', () => {
  beforeEach(() => {
    fakeTransactionModel.__reset();
    fakePaymentEventModel.__reset();
    vi.clearAllMocks();
    fakePaymentEventModel.create = makeIdempotentCreate();
  });

  it('processes a CONFIRMED webhook once: PAYMENT_PENDING -> ESCROW_ACTIVE', async () => {
    const txn = await fakeTransactionModel.create({
      paymentReference: 'GM-REF-1',
      escrowStatus: TransactionState.PAYMENT_PENDING,
      paymentStatus: PaymentStatus.PENDING,
      stateHistory: [],
    });

    parseWebhookMock.mockResolvedValue({
      providerEventId: 'evt-1',
      reference: 'GM-REF-1',
      status: 'CONFIRMED',
      rawPayload: {},
    });

    await PaymentService.handleWebhook({}, {});

    const updated = await fakeTransactionModel.findById(txn._id);
    expect(updated!.escrowStatus).toBe(TransactionState.ESCROW_ACTIVE);
    expect(updated!.paymentStatus).toBe(PaymentStatus.CONFIRMED);
  });

  it('a webhook received twice with the same providerEventId does not double-process (§31/§37)', async () => {
    const txn = await fakeTransactionModel.create({
      paymentReference: 'GM-REF-2',
      escrowStatus: TransactionState.PAYMENT_PENDING,
      paymentStatus: PaymentStatus.PENDING,
      stateHistory: [],
    });

    parseWebhookMock.mockResolvedValue({
      providerEventId: 'evt-duplicate',
      reference: 'GM-REF-2',
      status: 'CONFIRMED',
      rawPayload: {},
    });

    await PaymentService.handleWebhook({}, {});
    const afterFirst = await fakeTransactionModel.findById(txn._id);
    expect(afterFirst!.escrowStatus).toBe(TransactionState.ESCROW_ACTIVE);

    // Deuxième réception du MÊME event (retry provider, replay attaque...)
    await PaymentService.handleWebhook({}, {});

    const afterSecond = await fakeTransactionModel.findById(txn._id);
    expect(afterSecond!.escrowStatus).toBe(TransactionState.ESCROW_ACTIVE); // inchangé, pas re-avancé
  });

  it('marks paymentStatus FAILED when the provider reports a non-CONFIRMED status', async () => {
    const txn = await fakeTransactionModel.create({
      paymentReference: 'GM-REF-3',
      escrowStatus: TransactionState.PAYMENT_PENDING,
      paymentStatus: PaymentStatus.PENDING,
      stateHistory: [],
    });

    parseWebhookMock.mockResolvedValue({
      providerEventId: 'evt-3',
      reference: 'GM-REF-3',
      status: 'FAILED',
      rawPayload: {},
    });

    await PaymentService.handleWebhook({}, {});

    const updated = await fakeTransactionModel.findById(txn._id);
    expect(updated!.paymentStatus).toBe(PaymentStatus.FAILED);
    expect(updated!.escrowStatus).toBe(TransactionState.PAYMENT_PENDING); // pas avancée
  });

  it('silently ignores a webhook referencing an unknown transaction (no crash, no state change)', async () => {
    parseWebhookMock.mockResolvedValue({
      providerEventId: 'evt-unknown',
      reference: 'GM-DOES-NOT-EXIST',
      status: 'CONFIRMED',
      rawPayload: {},
    });

    await expect(PaymentService.handleWebhook({}, {})).resolves.not.toThrow();
  });

  it('triggers affiliate conversion creation only when the transaction carries an attribution', async () => {
    const txn = await fakeTransactionModel.create({
      paymentReference: 'GM-REF-AFF',
      escrowStatus: TransactionState.PAYMENT_PENDING,
      paymentStatus: PaymentStatus.PENDING,
      stateHistory: [],
      attributedAffiliate: 'aff-1',
      attributionType: 'AFFILIATE_LINK',
    });

    parseWebhookMock.mockResolvedValue({
      providerEventId: 'evt-aff',
      reference: 'GM-REF-AFF',
      status: 'CONFIRMED',
      rawPayload: {},
    });

    await PaymentService.handleWebhook({}, {});

    expect(createConversionMock).toHaveBeenCalledTimes(1);
    expect(createConversionMock.mock.calls[0]![0]._id).toBe(txn._id);
  });

  it('does not call the affiliate commission service when no attribution exists', async () => {
    await fakeTransactionModel.create({
      paymentReference: 'GM-REF-NOAFF',
      escrowStatus: TransactionState.PAYMENT_PENDING,
      paymentStatus: PaymentStatus.PENDING,
      stateHistory: [],
    });

    parseWebhookMock.mockResolvedValue({
      providerEventId: 'evt-noaff',
      reference: 'GM-REF-NOAFF',
      status: 'CONFIRMED',
      rawPayload: {},
    });

    await PaymentService.handleWebhook({}, {});

    expect(createConversionMock).not.toHaveBeenCalled();
  });
});

describe('PaymentService.syncPaymentStatus — vérification active (filet anti-IPN perdu)', () => {
  beforeEach(() => {
    fakeTransactionModel.__reset();
    fakePaymentEventModel.__reset();
    vi.clearAllMocks();
  });

  it('advances PAYMENT_PENDING -> ESCROW_ACTIVE when the provider confirms the payment', async () => {
    const txn = await fakeTransactionModel.create({
      buyer: 'user-buyer',
      paymentReference: 'GM-SYNC-1',
      providerTransactionId: 'test_token_1',
      escrowStatus: TransactionState.PAYMENT_PENDING,
      paymentStatus: PaymentStatus.PENDING,
      stateHistory: [],
    });

    verifyTransactionMock.mockResolvedValue('CONFIRMED');

    const { synced } = await PaymentService.syncPaymentStatus({
      transactionId: txn._id,
      userId: 'user-buyer',
    });

    expect(verifyTransactionMock).toHaveBeenCalledWith('test_token_1');
    expect(synced).toBe(true);

    const updated = await fakeTransactionModel.findById(txn._id);
    expect(updated!.escrowStatus).toBe(TransactionState.ESCROW_ACTIVE);
    expect(updated!.paymentStatus).toBe(PaymentStatus.CONFIRMED);
  });

  it('does NOT call the provider when the transaction was already advanced (IPN arrived meanwhile)', async () => {
    const txn = await fakeTransactionModel.create({
      buyer: 'user-buyer',
      paymentReference: 'GM-SYNC-2',
      providerTransactionId: 'test_token_2',
      escrowStatus: TransactionState.ESCROW_ACTIVE,
      paymentStatus: PaymentStatus.CONFIRMED,
      stateHistory: [],
    });

    const result = await PaymentService.syncPaymentStatus({
      transactionId: txn._id,
      userId: 'user-buyer',
    });

    expect(verifyTransactionMock).not.toHaveBeenCalled();
    expect(result.synced).toBe(false);
  });

  it('marks the payment FAILED when the provider reports a non-confirmed status, without advancing escrow', async () => {
    const txn = await fakeTransactionModel.create({
      buyer: 'user-buyer',
      paymentReference: 'GM-SYNC-3',
      providerTransactionId: 'test_token_3',
      escrowStatus: TransactionState.PAYMENT_PENDING,
      paymentStatus: PaymentStatus.PENDING,
      stateHistory: [],
    });

    verifyTransactionMock.mockResolvedValue('CANCELLED');

    await PaymentService.syncPaymentStatus({
      transactionId: txn._id,
      userId: 'user-buyer',
    });

    const updated = await fakeTransactionModel.findById(txn._id);
    expect(updated!.paymentStatus).toBe(PaymentStatus.FAILED);
    expect(updated!.escrowStatus).toBe(TransactionState.PAYMENT_PENDING); // pas avancée
  });

  it('rejects a caller who is not the buyer (no forged status check)', async () => {
    const txn = await fakeTransactionModel.create({
      buyer: 'user-buyer',
      seller: 'user-seller',
      paymentReference: 'GM-SYNC-4',
      providerTransactionId: 'test_token_4',
      escrowStatus: TransactionState.PAYMENT_PENDING,
      paymentStatus: PaymentStatus.PENDING,
      stateHistory: [],
    });

    await expect(
      PaymentService.syncPaymentStatus({ transactionId: txn._id, userId: 'user-seller' }),
    ).rejects.toThrow("Seul l'acheteur peut vérifier le paiement");
    expect(verifyTransactionMock).not.toHaveBeenCalled();
  });

  it('is a no-op when providerTransactionId is missing (legacy transaction)', async () => {
    const txn = await fakeTransactionModel.create({
      buyer: 'user-buyer',
      paymentReference: 'GM-SYNC-5',
      escrowStatus: TransactionState.PAYMENT_PENDING,
      paymentStatus: PaymentStatus.PENDING,
      stateHistory: [],
    });

    const result = await PaymentService.syncPaymentStatus({
      transactionId: txn._id,
      userId: 'user-buyer',
    });

    expect(verifyTransactionMock).not.toHaveBeenCalled();
    expect(result.synced).toBe(false);

    const updated = await fakeTransactionModel.findById(txn._id);
    expect(updated!.escrowStatus).toBe(TransactionState.PAYMENT_PENDING);
  });
});
