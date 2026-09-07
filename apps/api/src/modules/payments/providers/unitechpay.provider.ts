import { createHmac, timingSafeEqual } from 'node:crypto';
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
 * Implémentation UnitechPay — agrégateur Mobile Money sénégalais (Wave).
 *
 * Contrairement à PayDunya, UnitechPay identifie la transaction par SON
 * propre `transaction_id` (retourné à l'initiation puis renvoyé dans le
 * webhook), pas par notre `paymentReference` interne. On stocke donc ce
 * `transaction_id` dans `transaction.providerTransactionId` (champ déjà
 * présent sur le modèle), et c'est cette valeur qui sert de référence de
 * rapprochement dans handleWebhook (cf. payments.service.ts).
 *
 * Deux points à vérifier en sandbox réel avant la mise en production (non
 * documentés par UnitechPay):
 *  - les valeurs exactes du champ `status` renvoyé par `?action=transactions`
 *    (on gère pending/completed/failed/expired, voir mapStatus);
 *  - la présence éventuelle d'un paramètre de filtre par `transaction_id`
 *    sur ce même endpoint (absent de la doc, on liste tout côté client).
 */

interface UnitechCreateWaveResponse {
  success?: boolean;
  data?: {
    transaction_id?: string | number;
    payment_url?: string;
  };
}

// Statuts `status` tels que documentés pour le webhook. Pour l'endpoint
// de consultation (?action=transactions) les libellés ne sont pas spécifiés
// dans la doc — mapStatus les tolère tous deux.
function mapStatus(status: string | undefined): ProviderPaymentStatus {
  if (status === 'completed' || status === 'success') return 'CONFIRMED';
  if (status === 'pending' || status === 'processing') return 'PENDING';
  if (status === 'expired') return 'CANCELLED';
  return 'FAILED';
}

export class UnitechPayProvider implements PaymentProvider {
  private async request(path: string, init?: RequestInit): Promise<unknown> {
    const res = await fetch(`${env.UNITECHPAY_BASE_URL}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${env.UNITECHPAY_API_KEY}`,
        'Content-Type': 'application/json',
        ...(init?.headers ?? {}),
      },
    });

    if (!res.ok) {
      logger.error(
        { status: res.status, statusText: res.statusText },
        'Réponse UnitechPay non-2xx',
      );
      throw new AppError(
        ErrorCode.PAYMENT_INIT_FAILED,
        "Impossible d'appeler l'API UnitechPay",
        res.status >= 500 ? res.status : 502,
      );
    }

    return res.json();
  }

  async initiatePayment(input: InitiatePaymentInput): Promise<InitiatePaymentResult> {
    let payload: UnitechCreateWaveResponse;
    try {
      payload = (await this.request('?action=create_wave_payment', {
        method: 'POST',
        body: JSON.stringify({
          amount: input.amount,
          customer_number: input.customer.phone,
          description: input.description,
          callback_success: input.returnUrl,
          callback_cancel: input.returnUrl,
        }),
      })) as UnitechCreateWaveResponse;
    } catch (err) {
      if (err instanceof AppError) throw err;
      logger.error({ err }, 'Échec initiation paiement UnitechPay');
      throw new AppError(ErrorCode.PAYMENT_INIT_FAILED, "Impossible d'initier le paiement", 502);
    }

    if (payload.success === false || !payload.data?.transaction_id || !payload.data?.payment_url) {
      logger.error({ payload }, 'Réponse UnitechPay invalide (success false ou data manquante)');
      throw new AppError(
        ErrorCode.PAYMENT_INIT_FAILED,
        'Réponse UnitechPay invalide (transaction_id ou payment_url manquant)',
        502,
        { provider: payload },
      );
    }

    return {
      paymentUrl: payload.data.payment_url,
      providerTransactionId: String(payload.data.transaction_id),
    };
  }

  /**
   * La doc UnitechPay ne documente AUCUN endpoint de consultation d'une
   * transaction précise — seulement `GET ?action=transactions` qui liste
   * tout. On filtre donc côté client, et on mappe le `status` de la ligne
   * trouvée vers ProviderPaymentStatus. Si l'API réelle expose un paramètre
   * de filtre par ID à l'usage (absent de la doc fournie), l'utiliser ici
   * plutôt que de tout lister.
   */
  async verifyTransaction(providerTransactionId: string): Promise<ProviderPaymentStatus> {
    // Note: à la différence d'initiatePayment (qui doit lever pour faire
    // échouer proprement la route), verifyTransaction suit le pattern
    // PayDunyaProvider : toute erreur réseau/API se traduit par un retour
    // FAILED, jamais une exception — le service l'appelle sans try/catch.
    let payload: { data?: Array<{ transaction_id?: string | number; status?: string }> };
    try {
      payload = (await this.request('?action=transactions')) as {
        data?: Array<{ transaction_id?: string | number; status?: string }>;
      };
    } catch (err) {
      logger.error({ err, providerTransactionId }, 'Échec vérification transaction UnitechPay');
      return 'FAILED';
    }

    const found = (payload.data ?? []).find(
      (t) => t.transaction_id !== undefined && String(t.transaction_id) === providerTransactionId,
    );

    if (!found) {
      logger.warn({ providerTransactionId }, 'Transaction UnitechPay introuvable dans la liste');
      return 'FAILED';
    }

    return mapStatus(found.status);
  }

  async parseWebhook(
    rawBody: unknown,
    _headers: Record<string, string | string[] | undefined>,
  ): Promise<WebhookEvent> {
    const data = rawBody as {
      event?: string;
      transaction_id?: string | number;
      reference?: string;
      amount?: string | number;
      status?: string;
      method?: string;
      commission?: string | number;
      net_amount?: string | number;
      timestamp?: string | number;
      signed_at?: string | number;
      signature?: string;
    };

    if (!data || typeof data !== 'object' || !data.event || !data.transaction_id || !data.signature) {
      throw new AppError(ErrorCode.VALIDATION_ERROR, 'Webhook UnitechPay invalide', 400);
    }

    // Méthode 2 (canonique) de la doc UnitechPay: chaîne signée = champs
    // séparés par `|`, signée par HMAC-SHA256 de la clé API. Plus robuste
    // derrière un proxy/CDN (Railway) que la vérification par en-tête.
    const signed = `${data.event}|${data.reference ?? ''}|${data.amount ?? ''}|${data.status ?? ''}|${data.signed_at ?? ''}`;
    const expected = createHmac('sha256', env.UNITECHPAY_API_KEY).update(signed).digest('hex');

    // Comparaison à temps constant (timingSafeEqual) pour ne pas fuiter
    // d'information sur la signature par mesure de temps.
    const receivedBuffer = Buffer.from(String(data.signature), 'hex');
    const expectedBuffer = Buffer.from(String(expected), 'hex');
    const signatureValid =
      receivedBuffer.length === expectedBuffer.length &&
      timingSafeEqual(receivedBuffer, expectedBuffer);

    if (!signatureValid) {
      logger.warn({ event: data.event }, 'Signature webhook UnitechPay invalide');
      throw new AppError(
        ErrorCode.WEBHOOK_SIGNATURE_INVALID,
        'Signature webhook UnitechPay invalide',
        401,
      );
    }

    let status: ProviderPaymentStatus;
    if (data.event === 'payment_completed') status = 'CONFIRMED';
    else if (data.event === 'payment_failed') status = 'FAILED';
    else if (data.event === 'payment_expired') status = 'CANCELLED';
    else status = mapStatus(data.status);

    // providerEventId pour l'idempotence (réutilise PaymentEventModel,
    // inchangé) — on couple transaction_id + event pour que plusieurs
    // évènements d'une même transaction restent distincts.
    const transactionId = String(data.transaction_id);

    return {
      providerEventId: `${transactionId}-${data.event}`,
      // C'est le transaction_id UnitechPay qu'on a stocké comme
      // providerTransactionId à l'initiation — pas data.reference (inutilisé
      // par notre plateforme).
      reference: transactionId,
      status,
      rawPayload: rawBody,
    };
  }
}
