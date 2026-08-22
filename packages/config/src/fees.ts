export interface FeeRule {
  transactionFeePercentage: number; // ex: 0.10 = 10%
  minimumFee: number;
  maximumFee?: number;
}

/**
 * Valeurs par défaut de seed. La source de vérité runtime est
 * `PlatformSettings` en base, administrable depuis l'admin dashboard.
 */
export const DEFAULT_FEE_RULE: FeeRule = {
  transactionFeePercentage: 0.1,
  minimumFee: 500, // FCFA
};

export function computeFee(amount: number, rule: FeeRule = DEFAULT_FEE_RULE): number {
  const raw = amount * rule.transactionFeePercentage;
  const withMinimum = Math.max(raw, rule.minimumFee);
  return rule.maximumFee ? Math.min(withMinimum, rule.maximumFee) : withMinimum;
}
