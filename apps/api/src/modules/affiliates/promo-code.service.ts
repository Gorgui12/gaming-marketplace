import { DiscountType } from '@gm/types';
import { AppError } from '../../lib/errors/app-error.js';
import { ErrorCode } from '../../lib/errors/error-codes.js';
import { PromoCodeModel } from './promo-code.model.js';
import { roundMoney } from '@gm/utils';

export interface AppliedPromoCode {
  code: string;
  affiliateId?: string;
  campaignId?: string;
  discountAmount: number;
}

export class PromoCodeService {
  static async validateAndApply(input: {
    code: string;
    orderAmount: number;
    userId: string;
  }): Promise<AppliedPromoCode> {
    const promo = await PromoCodeModel.findOne({ code: input.code.toUpperCase(), active: true });
    if (!promo) {
      throw new AppError(ErrorCode.VALIDATION_ERROR, 'Code promo invalide ou expiré', 400);
    }

    const now = new Date();
    if (promo.startDate && promo.startDate > now) {
      throw new AppError(ErrorCode.VALIDATION_ERROR, "Ce code n'est pas encore actif", 400);
    }
    if (promo.endDate && promo.endDate < now) {
      throw new AppError(ErrorCode.VALIDATION_ERROR, 'Ce code a expiré', 400);
    }
    if (promo.usageLimit && promo.usedCount >= promo.usageLimit) {
      throw new AppError(
        ErrorCode.VALIDATION_ERROR,
        "Ce code a atteint sa limite d'utilisation",
        400,
      );
    }
    if (promo.minimumOrderAmount && input.orderAmount < promo.minimumOrderAmount) {
      throw new AppError(
        ErrorCode.VALIDATION_ERROR,
        `Montant minimum requis: ${promo.minimumOrderAmount}`,
        400,
      );
    }

    // Note MVP: usagePerUser nécessiterait une table de suivi par
    // utilisateur (PromoCodeUsage) pour être vérifié précisément — à
    // ajouter si le besoin business se confirme (actuellement non bloquant
    // pour le MVP, documenté ici pour visibilité).

    let discountAmount: number;
    if (promo.discountType === DiscountType.PERCENTAGE) {
      discountAmount = input.orderAmount * (promo.discountValue / 100);
      if (promo.maximumDiscount) {
        discountAmount = Math.min(discountAmount, promo.maximumDiscount);
      }
    } else {
      discountAmount = promo.discountValue;
    }
    discountAmount = roundMoney(Math.min(discountAmount, input.orderAmount));

    return {
      code: promo.code,
      affiliateId: promo.affiliate ? String(promo.affiliate) : undefined,
      campaignId: promo.campaign ? String(promo.campaign) : undefined,
      discountAmount,
    };
  }

  static async recordUsage(code: string): Promise<void> {
    await PromoCodeModel.findOneAndUpdate(
      { code: code.toUpperCase() },
      { $inc: { usedCount: 1 } },
    );
  }
}
