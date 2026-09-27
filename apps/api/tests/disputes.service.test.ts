import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TransactionState, DisputeStatus, NotificationType } from '@gm/types';
import { createFakeModel } from './helpers/fake-model.js';

const fakeTransactionModel = createFakeModel();
const fakeDisputeModel = createFakeModel();
const fakeListingModel = createFakeModel();
const fakeUserModel = createFakeModel();

vi.mock('../src/modules/transactions/transaction.model.js', () => ({
  TransactionModel: fakeTransactionModel,
}));
vi.mock('../src/modules/disputes/dispute.model.js', () => ({ DisputeModel: fakeDisputeModel }));
vi.mock('../src/modules/listings/listing.model.js', () => ({ ListingModel: fakeListingModel }));
vi.mock('../src/modules/users/user.model.js', () => ({ UserModel: fakeUserModel }));
vi.mock('../src/modules/audit/audit.service.js', () => ({ AuditService: { log: vi.fn() } }));
vi.mock('../src/lib/email/email.service.js', () => ({
  EmailService: {
    sendDisputeOpened: vi.fn().mockResolvedValue(undefined),
    sendDisputeResolved: vi.fn().mockResolvedValue(undefined),
  },
}));
vi.mock('../src/modules/notifications/notification.service.js', () => ({
  NotificationService: { create: vi.fn().mockResolvedValue(undefined) },
}));

const { DisputesService } = await import('../src/modules/disputes/disputes.service.js');
const { EmailService } = await import('../src/lib/email/email.service.js');
const { NotificationService } = await import('../src/modules/notifications/notification.service.js');

// Identifiants au format ObjectId réel : `assignedAdmin` est typé ObjectId et
// `new Types.ObjectId()` refuse toute chaîne qui n'est pas du hex 24. Les
// tests doivent donc refléter la forme réelle des ids en base, pas des
// identifiants lisibles arbitraires.
const BUYER_ID = 'bbbbbbbbbbbbbbbbbbbbbbbb';
const SELLER_ID = 'cccccccccccccccccccccccc';
const ADMIN_ID = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const STRANGER_ID = 'dddddddddddddddddddddddd';

const VALID_INPUT = {
  transactionId: 'tx-1',
  reason: 'ACCESS_INCORRECT',
  description: 'Les accès reçus ne correspondent pas du tout à ce qui est annoncé.',
};

async function seedTransaction(overrides: Record<string, unknown> = {}) {
  return fakeTransactionModel.create({
    buyer: BUYER_ID,
    seller: SELLER_ID,
    listing: 'listing-1',
    amount: 50_000,
    currency: 'XOF',
    escrowStatus: TransactionState.BUYER_REVIEWING,
    disputeStatus: 'none',
    stateHistory: [],
    ...overrides,
  });
}

async function seedParticipants() {
  await fakeUserModel.create({
    _id: BUYER_ID,
    email: 'buyer@test.com',
    firstName: 'Acheteur',
  });
  await fakeUserModel.create({
    _id: SELLER_ID,
    email: 'seller@test.com',
    firstName: 'Vendeur',
  });
}

describe('DisputesService.open', () => {
  beforeEach(() => {
    fakeTransactionModel.__reset();
    fakeDisputeModel.__reset();
    fakeListingModel.__reset();
    fakeUserModel.__reset();
    vi.clearAllMocks();
  });

  it('crée le litige et bascule la transaction en DISPUTED', async () => {
    const tx = await seedTransaction();

    const dispute = await DisputesService.open({ ...VALID_INPUT, transactionId: tx._id, userId: BUYER_ID });

    expect(dispute.reason).toBe('ACCESS_INCORRECT');
    expect(String(dispute.transaction)).toBe(String(tx._id));
    expect(String(dispute.openedBy)).toBe(BUYER_ID);
    // Le statut par défaut (OPEN) est un `default` du schéma Mongoose, que le
    // fake model n'émule pas : on ne l'assert pas ici. Ce qui compte — que le
    // service ne fige pas le statut et que la clôture fonctionne — est couvert
    // par les tests de closeForTransaction.

    const stored = await fakeTransactionModel.findById(tx._id);
    expect(stored?.escrowStatus).toBe(TransactionState.DISPUTED);
    expect(stored?.disputeStatus).toBe('open');
    // La state machine doit rester la seule source de vérité : toute
    // transition doit laisser une trace dans l'historique.
    expect(stored?.stateHistory).toHaveLength(1);
  });

  it('refuse un tiers qui n\'est pas partie prenante', async () => {
    const tx = await seedTransaction();
    await expect(
      DisputesService.open({ ...VALID_INPUT, transactionId: tx._id, userId: STRANGER_ID }),
    ).rejects.toThrow(/partie prenante/);
  });

  it('refuse le vendeur (le litige s\'ouvre via le support)', async () => {
    const tx = await seedTransaction();
    await expect(
      DisputesService.open({ ...VALID_INPUT, transactionId: tx._id, userId: SELLER_ID }),
    ).rejects.toThrow(/partie prenante/);
  });

  it('refuse un second litige sur la même transaction (garde anti-doublon)', async () => {
    const tx = await seedTransaction();
    await DisputesService.open({ ...VALID_INPUT, transactionId: tx._id, userId: BUYER_ID });

    await expect(
      DisputesService.open({ ...VALID_INPUT, transactionId: tx._id, userId: BUYER_ID }),
    ).rejects.toThrow(/déjà ouvert/);
  });

  it('refuse un litige sur une transaction déjà terminée (transition illégale)', async () => {
    const tx = await seedTransaction({ escrowStatus: TransactionState.COMPLETED });
    await expect(
      DisputesService.open({ ...VALID_INPUT, transactionId: tx._id, userId: BUYER_ID }),
    ).rejects.toThrow(/Transition invalide/);
  });

  it('prévient le vendeur ET l\'acheteur à l\'ouverture', async () => {
    const tx = await seedTransaction();
    await seedParticipants();

    await DisputesService.open({ ...VALID_INPUT, transactionId: tx._id, userId: BUYER_ID });

    const emails = vi.mocked(EmailService.sendDisputeOpened).mock.calls.map((c) => c[0]);
    const sellerMail = emails.find((e) => e.role === 'seller');
    const buyerMail = emails.find((e) => e.role === 'buyer');
    // Sans cet email, le vendeur découvre le gel de son paiement sans motif.
    expect(sellerMail?.to).toBe('seller@test.com');
    // Le motif est envoyé traduit, pas en enum brut.
    expect(sellerMail?.reason).toMatch(/accès/i);
    expect(buyerMail?.to).toBe('buyer@test.com');

    const notified = vi.mocked(NotificationService.create).mock.calls.map((c) => c[0]);
    expect(notified.map((n) => n.userId)).toContain(SELLER_ID);
    expect(notified.map((n) => n.userId)).toContain(BUYER_ID);
    expect(notified.every((n) => n.type === NotificationType.DISPUTE_OPENED)).toBe(true);
  });
});

describe('DisputesService.closeForTransaction', () => {
  beforeEach(() => {
    fakeTransactionModel.__reset();
    fakeDisputeModel.__reset();
    fakeListingModel.__reset();
    fakeUserModel.__reset();
    vi.clearAllMocks();
  });

  it('solde le litige, enregistre la décision et notifie les deux parties', async () => {
    const tx = await seedTransaction({ escrowStatus: TransactionState.DISPUTED, disputeStatus: 'open' });
    const dispute = await fakeDisputeModel.create({
      transaction: tx._id,
      openedBy: BUYER_ID,
      reason: 'ACCESS_INCORRECT',
      description: 'description assez longue pour être acceptée',
      status: DisputeStatus.OPEN,
    });
    await seedParticipants();

    const closed = await DisputesService.closeForTransaction({
      transactionId: tx._id,
      outcome: 'BUYER',
      resolution: 'Les accès ne correspondent pas à l\'annonce.',
      adminId: ADMIN_ID,
    });

    expect(closed?.status).toBe(DisputeStatus.RESOLVED_BUYER);
    expect(closed?.resolution).toBe('Les accès ne correspondent pas à l\'annonce.');
    expect(closed?.resolvedAt).toBeInstanceOf(Date);
    expect(String(closed?.assignedAdmin)).toBe(ADMIN_ID);

    const emails = vi.mocked(EmailService.sendDisputeResolved).mock.calls.map((c) => c[0]);
    expect(emails).toHaveLength(2);
    // Les deux parties doivent apprendre la décision, y compris celle qui la
    // perd : le vendeur doit comprendre pourquoi il n'est pas payé.
    expect(emails.map((e) => e.role).sort()).toEqual(['buyer', 'seller']);
    expect(emails.every((e) => e.outcome === 'BUYER')).toBe(true);

    const notified = vi.mocked(NotificationService.create).mock.calls.map((c) => c[0]);
    expect(notified).toHaveLength(2);
    expect(notified.every((n) => n.type === NotificationType.DISPUTE_RESOLVED)).toBe(true);
  });

  it('marque RESOLVED_SELLER quand la décision est favorable au vendeur', async () => {
    const tx = await seedTransaction({ escrowStatus: TransactionState.DISPUTED, disputeStatus: 'open' });
    await fakeDisputeModel.create({
      transaction: tx._id,
      openedBy: BUYER_ID,
      reason: 'OTHER',
      description: 'description assez longue pour être acceptée',
      status: DisputeStatus.OPEN,
    });
    await seedParticipants();

    const closed = await DisputesService.closeForTransaction({
      transactionId: tx._id,
      outcome: 'SELLER',
      resolution: 'La vente est conforme.',
      adminId: ADMIN_ID,
    });

    expect(closed?.status).toBe(DisputeStatus.RESOLVED_SELLER);

    // La partie perdante ne doit jamais lire « en votre faveur ». C'est
    // l'ancien bug : le titre de notification était déduit du rôle et non de
    // l'issue, donc le vendeur perdant était notifié d'une décision
    // favorable. Le titre doit donc être identique pour les deux parties et
    // dépendre de l'outcome.
    const notified = vi.mocked(NotificationService.create).mock.calls.map((c) => c[0]);
    expect(notified).toHaveLength(2);
    expect(new Set(notified.map((n) => n.title)).size).toBe(1);
    expect(notified[0]!.title).toMatch(/vendeur/);
    expect(notified.every((n) => !n.title.includes('votre faveur'))).toBe(true);
  });

  it('reste silencieux si aucun litige n\'est ouvert (remboursement admin direct)', async () => {
    const tx = await seedTransaction({ escrowStatus: TransactionState.DISPUTED, disputeStatus: 'none' });

    // Ne doit surtout pas échouer : rembourser une transaction bloquée sans
    // qu'un litige existe est un flux légitime.
    const result = await DisputesService.closeForTransaction({
      transactionId: tx._id,
      outcome: 'BUYER',
      resolution: 'Geste commercial',
      adminId: ADMIN_ID,
    });

    expect(result).toBeNull();
    expect(EmailService.sendDisputeResolved).not.toHaveBeenCalled();
  });

  it('ne solde pas un litige déjà clôturé (idempotence)', async () => {
    const tx = await seedTransaction({ escrowStatus: TransactionState.DISPUTED, disputeStatus: 'resolved' });
    await fakeDisputeModel.create({
      transaction: tx._id,
      openedBy: BUYER_ID,
      reason: 'OTHER',
      description: 'description assez longue pour être acceptée',
      status: DisputeStatus.RESOLVED_BUYER,
    });

    const result = await DisputesService.closeForTransaction({
      transactionId: tx._id,
      outcome: 'SELLER',
      resolution: 'tentative de réouverture',
      adminId: ADMIN_ID,
    });

    expect(result).toBeNull();
  });
});

describe('DisputesService.listForUser', () => {
  beforeEach(() => {
    fakeTransactionModel.__reset();
    fakeDisputeModel.__reset();
    vi.clearAllMocks();
  });

  it('inclut les litiges ouverts sur mes ventes, même si je ne les ai pas ouverts', async () => {
    // Le vendeur n'ouvre pas de litige mais doit pouvoir suivre celui ouvert
    // par l'acheteur sur une de ses ventes.
    const tx = await seedTransaction();
    await fakeDisputeModel.create({
      transaction: tx._id,
      openedBy: BUYER_ID,
      reason: 'ACCESS_INCORRECT',
      description: 'description assez longue pour être acceptée',
      status: DisputeStatus.OPEN,
    });

    const asSeller = await DisputesService.listForUser(SELLER_ID);
    expect(asSeller).toHaveLength(1);

    const asStranger = await DisputesService.listForUser(STRANGER_ID);
    expect(asStranger).toHaveLength(0);
  });
});
