import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createFakeModel } from './helpers/fake-model.js';

const fakeAffiliateModel = createFakeModel();
const fakeTierModel = createFakeModel();

vi.mock('../src/modules/affiliates/affiliate.model.js', () => ({
  AffiliateModel: fakeAffiliateModel,
}));
vi.mock('../src/modules/affiliates/affiliate-tier.model.js', () => ({
  AffiliateTierModel: fakeTierModel,
}));
vi.mock('../src/modules/audit/audit.service.js', () => ({
  AuditService: { log: vi.fn() },
}));

const { AffiliateService } = await import('../src/modules/affiliates/affiliate.service.js');

describe('AffiliateService.changeTier', () => {
  beforeEach(() => {
    fakeAffiliateModel.__reset();
    fakeTierModel.__reset();
    vi.clearAllMocks();
  });

  it('applies the tier default commission rate to the affiliate on change', async () => {
    const tier = await fakeTierModel.create({
      slug: 'gold',
      defaultCommissionRate: 0.09,
    });
    const affiliate = await fakeAffiliateModel.create({
      user: 'aff-user-1',
      commissionRate: 0.03,
    });

    await AffiliateService.changeTier({
      affiliateId: affiliate._id,
      adminId: 'admin-1',
      tierSlug: 'gold',
    });

    const updated = await fakeAffiliateModel.findById(affiliate._id);
    expect(updated!.commissionRate).toBe(0.09);
    expect(updated!.tier).toBe(tier._id);
  });

  it('rejects an unknown tier slug', async () => {
    const affiliate = await fakeAffiliateModel.create({ user: 'aff-user-2', commissionRate: 0.03 });

    await expect(
      AffiliateService.changeTier({
        affiliateId: affiliate._id,
        adminId: 'admin-1',
        tierSlug: 'ambassador',
      }),
    ).rejects.toThrow(/Niveau inconnu/);
  });

  it('throws when the affiliate does not exist', async () => {
    await expect(
      AffiliateService.changeTier({
        affiliateId: 'missing',
        adminId: 'admin-1',
        tierSlug: 'gold',
      }),
    ).rejects.toThrow(/introuvable/);
  });
});

describe('AffiliateService.updateTier', () => {
  beforeEach(() => {
    fakeTierModel.__reset();
    vi.clearAllMocks();
  });

  it('updates the default commission rate of a tier', async () => {
    const tier = await fakeTierModel.create({
      slug: 'starter',
      defaultCommissionRate: 0.03,
    });

    await AffiliateService.updateTier({
      tierId: tier._id,
      adminId: 'admin-1',
      defaultCommissionRate: 0.04,
    });

    const updated = await fakeTierModel.findById(tier._id);
    expect(updated!.defaultCommissionRate).toBe(0.04);
  });
});