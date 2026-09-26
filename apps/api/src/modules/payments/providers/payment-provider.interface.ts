export interface InitiatePaymentInput {
  amount: number;
  currency: string;
  reference: string;
  description: string;
  customer: {
    name: string;
    email: string;
    phone?: string;
  };
  returnUrl: string;
  notifyUrl: string;
}

export interface InitiatePaymentResult {
  paymentUrl: string;
  providerTransactionId: string;
}

export type ProviderPaymentStatus = 'PENDING' | 'CONFIRMED' | 'FAILED' | 'CANCELLED';

export interface WebhookEvent {
  providerEventId: string;
  reference: string;
  status: ProviderPaymentStatus;
  /**
   * Montant annoncé par le provider, UNIQUEMENT si ce champ est couvert
   * par la vérification d'intégrité du webhook (signature HMAC ou hash
   * secret partagé). `PaymentService.handleWebhook` le compare à
   * `transaction.amount` et refuse de solder si l'écart existe.
   *
   * `undefined` = montant non vérifiable → on ne peut pas comparer, le
   * rapprochement se fait alors uniquement sur la référence.
   */
  amount?: number;
  rawPayload: unknown;
}

export interface PaymentProvider {
  initiatePayment(input: InitiatePaymentInput): Promise<InitiatePaymentResult>;
  verifyTransaction(reference: string): Promise<ProviderPaymentStatus>;
  parseWebhook(rawBody: unknown, headers: Record<string, string | string[] | undefined>): Promise<WebhookEvent>;
}
