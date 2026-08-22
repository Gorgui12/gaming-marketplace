/**
 * Toutes les opérations monétaires internes sont faites en unité entière
 * de la devise la plus petite (ex: FCFA n'a pas de sous-unité usuelle) pour
 * éviter les erreurs d'arrondi flottant. On arrondit systématiquement au
 * plus proche entier après tout calcul de commission.
 */
export function roundMoney(amount: number): number {
  return Math.round(amount);
}

export function splitAmount(
  total: number,
  feeAmount: number,
): { sellerAmount: number; platformFee: number } {
  const platformFee = roundMoney(feeAmount);
  const sellerAmount = roundMoney(total - platformFee);
  return { sellerAmount, platformFee };
}
