/**
 * Abstraction distincte de PaymentProvider (§24 — ne jamais supposer que
 * PayDunya sert automatiquement au paiement des commissions — leur API
 * "Paiement Et Redistribution (PER)" existe et pourrait un jour servir de
 * base à un PayDunyaPayoutProvider si les affiliés ont un compte PayDunya,
 * mais ce n'est pas supposé/implémenté ici). Au MVP,
 * ManualPayoutProvider est la seule implémentation: elle ne fait rien
 * d'automatique, elle sert juste à typer le contrat pour un futur
 * MobileMoneyPayoutProvider ou BankTransferPayoutProvider.
 */
export interface PayoutRequest {
  affiliateId: string;
  amount: number;
  currency: string;
  destination?: string; // ex: numéro Mobile Money — optionnel au MVP manuel
}

export interface PayoutResult {
  accepted: boolean;
  reference?: string;
  notes?: string;
}

export interface PayoutProvider {
  requestPayout(input: PayoutRequest): Promise<PayoutResult>;
}

/**
 * Implémentation MVP: n'exécute aucun virement réel. Elle existe pour que
 * le workflow admin ait un point d'entrée cohérent, immédiatement
 * remplaçable par un vrai provider sans toucher AffiliatePayoutService.
 */
export class ManualPayoutProvider implements PayoutProvider {
  async requestPayout(input: PayoutRequest): Promise<PayoutResult> {
    return {
      accepted: false,
      notes: `Payout manuel requis pour l'affilié ${input.affiliateId} — aucun virement automatique au MVP.`,
    };
  }
}
