import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DiscountType } from '@gm/types';
import { createFakeModel } from './helpers/fake-model.js';

const fakePromoCodeModel = createFakeModel();

vi.mock('../src/modules/affiliates/promo-code.model.js', () => ({
  PromoCodeModel: fakePromoCodeModel,
}));

const { PromoCodeService } = await import('../src/modules/affiliates/promo-code.service.js');

describe('PromoCodeService.validateAndApply', () => {
  beforeEach(() => {
    fakePromoCodeModel.__reset();
  });

  it('rejects an unknown code', async () => {
    await expect(
      PromoCodeService.validateAndApply({ code: 'INEXISTANT', orderAmount: 10_000, userId: 'u1' }),
    ).rejects.toThrow(/invalide/);
  });

  it('rejects an inactive code', async () => {
    await fakePromoCodeModel.create({
      code: 'GORGAMING',
      active: false,
      discountType: DiscountType.PERCENTAGE,
      discountValue: 5,
      usedCount: 0,
    });
    await expect(
      PromoCodeService.validateAndApply({ code: 'GORGAMING', orderAmount: 10_000, userId: 'u1' }),
    ).rejects.toThrow(/invalide/);
  });

  it('rejects a code below its minimum order amount', async () => {
    await fakePromoCodeModel.create({
      code: 'MIN20K',
      active: true,
      discountType: DiscountType.FIXED_AMOUNT,
      discountValue: 1_000,
      minimumOrderAmount: 20_000,
      usedCount: 0,
    });
    await expect(
      PromoCodeService.validateAndApply({ code: 'MIN20K', orderAmount: 10_000, userId: 'u1' }),
    ).rejects.toThrow(/Montant minimum/);
  });

  it('rejects a code that reached its usage limit', async () => {
    await fakePromoCodeModel.create({
      code: 'LIMITED',
      active: true,
      discountType: DiscountType.PERCENTAGE,
      discountValue: 10,
      usageLimit: 5,
      usedCount: 5,
    });
    await expect(
      PromoCodeService.validateAndApply({ code: 'LIMITED', orderAmount: 10_000, userId: 'u1' }),
    ).rejects.toThrow(/limite/);
  });

  it('computes a percentage discount correctly', async () => {
    await fakePromoCodeModel.create({
      code: 'GORGAMING',
      active: true,
      discountType: DiscountType.PERCENTAGE,
      discountValue: 5, // 5%
      usedCount: 0,
    });
    const result = await PromoCodeService.validateAndApply({
      code: 'gorgaming', // casse volontairement différente
      orderAmount: 50_000,
      userId: 'u1',
    });
    expect(result.discountAmount).toBe(2_500);
    expect(result.code).toBe('GORGAMING');
  });

  it('caps a percentage discount at maximumDiscount when configured', async () => {
    await fakePromoCodeModel.create({
      code: 'BIGPROMO',
      active: true,
      discountType: DiscountType.PERCENTAGE,
      discountValue: 50, // 50% serait énorme
      maximumDiscount: 3_000,
      usedCount: 0,
    });
    const result = await PromoCodeService.validateAndApply({
      code: 'BIGPROMO',
      orderAmount: 50_000,
      userId: 'u1',
    });
    expect(result.discountAmount).toBe(3_000);
  });

  it('never lets a fixed discount exceed the order amount', async () => {
    await fakePromoCodeModel.create({
      code: 'HUGEFIXED',
      active: true,
      discountType: DiscountType.FIXED_AMOUNT,
      discountValue: 100_000, // supérieur au prix de l'annonce
      usedCount: 0,
    });
    const result = await PromoCodeService.validateAndApply({
      code: 'HUGEFIXED',
      orderAmount: 20_000,
      userId: 'u1',
    });
    expect(result.discountAmount).toBe(20_000); // jamais négatif ni > montant
  });
});
