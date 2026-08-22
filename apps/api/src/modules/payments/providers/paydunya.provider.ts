import { createHash } from 'node:crypto';
// Le package `paydunya` est en CommonJS pur, sans types officiels — d'où
// l'import par défaut suivi d'un typage minimal ci-dessous plutôt que de
// s'appuyer sur des types générés.
// @ts-expect-error - pas de déclarations de types fournies par le package
import PD from 'paydunya';
import { env } from '../../../config/env.js';
import { AppError } from '../../../lib/errors/app-error.js';
import { ErrorCode } from '../../../lib/errors/error-codes.js';
import { logger } from '../../../lib/logger.js';
import type {
  InitiatePaymentInput,
  InitiatePaymentResult,
  PaymentProvider,
  ProviderPaymentStatus,
  WebhookEvent,
} from './payment-provider.interface.js';

/**
 * Implémentation PayDunya — API "Paiement Avec Redirection (PAR)" via le
 * SDK Node.js officiel `paydunya` (checkout-invoice), conforme à leur
 * documentation Node.js fournie.
 *
 * Point important par rapport à l'ancienne intégration CinetPay: PayDunya
 * ne permet pas de fournir sa propre référence de transaction — c'est
 * PayDunya qui génère un `token` côté serveur. On conserve donc notre
 * propre `paymentReference` (GM-XXXX) comme clé primaire côté plateforme
 * en l'attachant via `addCustomData('internal_reference', ...)`, récupérée
 * ensuite dans le payload IPN sous `data.custom_data.internal_reference`.
 * Le `token` PayDunya, lui, est conservé comme `providerTransactionId` sur
 * la transaction (utile pour un futur appel `confirm()` de vérification
 * active).
 */

interface PaydunyaSetupCtor {
  new (config: {
    masterKey: string;
    privateKey: string;
    publicKey: string;
    token: string;
    mode: 'test' | 'live';
  }): unknown;
}
interface PaydunyaStoreCtor {
  new (config: { name: string; returnURL?: string; callbackURL?: string }): unknown;
}
interface PaydunyaCheckoutInvoice {
  totalAmount: number;
  description: string;
  returnURL?: string;
  callbackURL?: string;
  token?: string;
  url?: string;
  status?: string;
  addItem(name: string, quantity: number, unitPrice: number, totalPrice: number): void;
  addCustomData(key: string, value: string): void;
  create(): Promise<void>;
  confirm(token?: string): Promise<void>;
}
interface PaydunyaCheckoutInvoiceCtor {
  new (setup: unknown, store: unknown): PaydunyaCheckoutInvoice;
}

const paydunya = PD as {
  Setup: PaydunyaSetupCtor;
  Store: PaydunyaStoreCtor;
  CheckoutInvoice: PaydunyaCheckoutInvoiceCtor;
};

const setup = new paydunya.Setup({
  masterKey: env.PAYDUNYA_MASTER_KEY,
  privateKey: env.PAYDUNYA_PRIVATE_KEY,
  publicKey: env.PAYDUNYA_PUBLIC_KEY,
  token: env.PAYDUNYA_TOKEN,
  mode: env.PAYDUNYA_MODE,
});

function mapStatus(status: string | undefined): ProviderPaymentStatus {
  if (status === 'completed') return 'CONFIRMED';
  if (status === 'cancelled') return 'CANCELLED';
  if (status === 'pending') return 'PENDING';
  return 'FAILED';
}

export class PayDunyaProvider implements PaymentProvider {
  async initiatePayment(input: InitiatePaymentInput): Promise<InitiatePaymentResult> {
    const store = new paydunya.Store({
      name: env.PAYDUNYA_STORE_NAME,
      returnURL: input.returnUrl,
      callbackURL: input.notifyUrl,
    });

    const invoice = new paydunya.CheckoutInvoice(setup, store);
    invoice.totalAmount = input.amount;
    invoice.description = input.description;
    invoice.addItem(input.description, 1, input.amount, input.amount);
    invoice.addCustomData('internal_reference', input.reference);

    try {
      await invoice.create();
    } catch (err) {
      logger.error({ err }, 'Échec initiation paiement PayDunya');
      throw new AppError(ErrorCode.PAYMENT_INIT_FAILED, "Impossible d'initier le paiement", 502);
    }

    if (!invoice.url || !invoice.token) {
      throw new AppError(
        ErrorCode.PAYMENT_INIT_FAILED,
        'Réponse PayDunya invalide (url ou token manquant)',
        502,
      );
    }

    return {
      paymentUrl: invoice.url,
      providerTransactionId: invoice.token,
    };
  }

  /**
   * NOTE: contrairement à l'interface générique qui nomme ce paramètre
   * "reference", PayDunya exige ici son PROPRE token (providerTransactionId
   * retourné par initiatePayment), pas notre paymentReference interne — le
   * endpoint /confirm/:token de PayDunya n'accepte que leur identifiant.
   */
  async verifyTransaction(providerTransactionId: string): Promise<ProviderPaymentStatus> {
    const store = new paydunya.Store({ name: env.PAYDUNYA_STORE_NAME });
    const invoice = new paydunya.CheckoutInvoice(setup, store);
    try {
      await invoice.confirm(providerTransactionId);
    } catch (err) {
      logger.error({ err, providerTransactionId }, 'Échec vérification transaction PayDunya');
      return 'FAILED';
    }
    return mapStatus(invoice.status);
  }

  async parseWebhook(
    rawBody: unknown,
    _headers: Record<string, string | string[] | undefined>,
  ): Promise<WebhookEvent> {
    const payload = rawBody as {
      data?: {
        status?: string;
        hash?: string;
        invoice?: { token?: string; total_amount?: string };
        custom_data?: { internal_reference?: string };
      };
    };
    const data = payload.data;

    if (!data || !data.hash || !data.invoice?.token) {
      throw new AppError(ErrorCode.VALIDATION_ERROR, 'IPN PayDunya invalide', 400);
    }

    // Le hash renvoyé par PayDunya est le SHA-512 de votre Master Key —
    // ça prouve que l'appel provient bien de leurs serveurs (eux seuls
    // connaissent votre clé pour la hasher correctement), conformément à
    // leur documentation officielle.
    const expectedHash = createHash('sha512').update(env.PAYDUNYA_MASTER_KEY).digest('hex');
    if (data.hash !== expectedHash) {
      logger.warn({ token: data.invoice.token }, 'Hash IPN PayDunya invalide');
      throw new AppError(
        ErrorCode.WEBHOOK_SIGNATURE_INVALID,
        'Signature IPN PayDunya invalide',
        401,
      );
    }

    const internalReference = data.custom_data?.internal_reference;
    if (!internalReference) {
      throw new AppError(
        ErrorCode.VALIDATION_ERROR,
        'IPN PayDunya sans référence interne (custom_data manquant)',
        400,
      );
    }

    return {
      providerEventId: `${data.invoice.token}-${data.status ?? 'unknown'}`,
      reference: internalReference,
      status: mapStatus(data.status),
      rawPayload: rawBody,
    };
  }
}
