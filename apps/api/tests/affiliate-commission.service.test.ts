import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AttributionType, CommissionStatus, FraudReviewStatus } from '@gm/types';
import { createFakeModel } from './helpers/fake-model.js';

const fakeAffiliateModel = createFakeModel();
const fakeConversionModel = createFakeModel();

vi.mock('../src/modules/affiliates/affiliate.model.js', () => ({
  AffiliateModel: fakeAffiliateModel,
}));
vi.mock('../src/modules/affiliates/affiliate-conversion.model.js', () => ({
  AffiliateConversionModel: fakeConversionModel,
}));
vi.mock('../src/modules/affiliates/affiliate-attribution.service.js', () => ({
  AffiliateAttributionService: { markConsumed: vi.fn() },
}));
vi.mock('../src/modules/audit/audit.service.js', () => ({
  AuditService: { log: vi.fn() },
}));

const { AffiliateCommissionService } = await import(
  '../src/modules/affiliates/affiliate-commission.service.js'
);

function baseTransaction(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    _id: 'txn-1',
    buyer: 'buyer-1',
    amount: 50_000,
    sellerAmount: 45_000,
    platformFee: 5_000,
    currency: 'XOF',
    ...overrides,
  };
}

describe('AffiliateCommissionService.createConversionIfAttributed', () => {
  beforeEach(() => {
    fakeAffiliateModel.__reset();
    fakeConversionModel.__reset();
    vi.clearAllMocks();
  });

  it('does nothing when attribution is null (majority of transactions have no affiliate)', async () => {
    await AffiliateCommissionService.createConversionIfAttributed(baseTransaction(), null);
    expect(await fakeConversionModel.countDocuments()).toBe(0);
  });

  it('computes commission on NET_ORDER_AMOUNT (sellerAmount), not on the full order total', async () => {
    const affiliate = await fakeAffiliateModel.create({
      user: 'affiliate-user-1',
      commissionRate: 0.05, // 5%
      fraudReviewStatus: FraudReviewStatus.NORMAL,
    });

    await AffiliateCommissionService.createConversionIfAttributed(baseTransaction(), {
      affiliateId: affiliate._id,
      attributionType: AttributionType.AFFILIATE_LINK,
    });

    const conversions = await fakeConversionModel.find({});
    expect(conversions.length).toBe(1);
    // 5% de 45 000 (sellerAmount) = 2 250, PAS 5% de 50 000
    expect(conversions[0]!.commissionAmount).toBe(2_250);
    expect(conversions[0]!.status).toBe(CommissionStatus.PENDING);
  });

  it('never creates a second conversion for the same transaction (anti-double-commission, §31)', async () => {
    const affiliate = await fakeAffiliateModel.create({
      user: 'affiliate-user-1',
      commissionRate: 0.05,
      fraudReviewStatus: FraudReviewStatus.NORMAL,
    });
    const txn = baseTransaction();
    const attribution = { affiliateId: affiliate._id, attributionType: AttributionType.AFFILIATE_LINK };

    await AffiliateCommissionService.createConversionIfAttributed(txn, attribution);
    await AffiliateCommissionService.createConversionIfAttributed(txn, attribution);

    expect(await fakeConversionModel.countDocuments({ transaction: txn._id })).toBe(1);
  });

  it('blocks commission when the buyer is the affiliate themselves (self-referral, §13)', async () => {
    const affiliate = await fakeAffiliateModel.create({
      user: 'buyer-1', // même utilisateur que le buyer de la transaction
      commissionRate: 0.05,
      fraudReviewStatus: FraudReviewStatus.NORMAL,
    });

    await AffiliateCommissionService.createConversionIfAttributed(baseTransaction(), {
      affiliateId: affiliate._id,
      attributionType: AttributionType.AFFILIATE_LINK,
    });

    expect(await fakeConversionModel.countDocuments()).toBe(0);
  });

  it('blocks commission when the affiliate is flagged BLOCKED for fraud', async () => {
    const affiliate = await fakeAffiliateModel.create({
      user: 'affiliate-user-1',
      commissionRate: 0.05,
      fraudReviewStatus: FraudReviewStatus.BLOCKED,
    });

    await AffiliateCommissionService.createConversionIfAttributed(baseTransaction(), {
      affiliateId: affiliate._id,
      attributionType: AttributionType.AFFILIATE_LINK,
    });

    expect(await fakeConversionModel.countDocuments()).toBe(0);
  });
});

describe('AffiliateCommissionService.reverseForTransaction', () => {
  beforeEach(() => {
    fakeAffiliateModel.__reset();
    fakeConversionModel.__reset();
    vi.clearAllMocks();
  });

  it('reverses a PENDING commission on refund', async () => {
    const affiliate = await fakeAffiliateModel.create({ user: 'aff-1', pendingCommission: 2_250 });
    const conversion = await fakeConversionModel.create({
      transaction: 'txn-1',
      affiliate: affiliate._id,
      commissionAmount: 2_250,
      orderAmount: 50_000,
      status: CommissionStatus.PENDING,
    });

    await AffiliateCommissionService.reverseForTransaction('txn-1');

    const updated = await fakeConversionModel.findById(conversion._id);
    expect(updated!.status).toBe(CommissionStatus.REVERSED);
  });

  it('never reverses a commission that has already been PAID out', async () => {
    const affiliate = await fakeAffiliateModel.create({ user: 'aff-1' });
    const conversion = await fakeConversionModel.create({
      transaction: 'txn-2',
      affiliate: affiliate._id,
      commissionAmount: 1_000,
      orderAmount: 20_000,
      status: CommissionStatus.PAID,
    });

    await AffiliateCommissionService.reverseForTransaction('txn-2');

    const updated = await fakeConversionModel.findById(conversion._id);
    expect(updated!.status).toBe(CommissionStatus.PAID); // inchangé
  });

  it('is a no-op when no conversion exists for the transaction', async () => {
    await expect(
      AffiliateCommissionService.reverseForTransaction('unknown-txn'),
    ).resolves.not.toThrow();
  });
});

describe('AffiliateCommissionService.approveForTransaction', () => {
  beforeEach(() => {
    fakeConversionModel.__reset();
    vi.clearAllMocks();
  });

  it('moves a PENDING commission to APPROVED and sets a future clearance date', async () => {
    const conversion = await fakeConversionModel.create({
      transaction: 'txn-3',
      status: CommissionStatus.PENDING,
      commissionAmount: 1_000,
    });

    await AffiliateCommissionService.approveForTransaction('txn-3');

    const updated = await fakeConversionModel.findById(conversion._id);
    expect(updated!.status).toBe(CommissionStatus.APPROVED);
    expect(new Date(updated!.clearanceDueAt as string | Date).getTime()).toBeGreaterThan(
      Date.now(),
    );
  });
});
