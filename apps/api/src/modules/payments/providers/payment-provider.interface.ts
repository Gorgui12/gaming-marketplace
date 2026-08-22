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
  rawPayload: unknown;
}

export interface PaymentProvider {
  initiatePayment(input: InitiatePaymentInput): Promise<InitiatePaymentResult>;
  verifyTransaction(reference: string): Promise<ProviderPaymentStatus>;
  parseWebhook(rawBody: unknown, headers: Record<string, string | string[] | undefined>): Promise<WebhookEvent>;
}
