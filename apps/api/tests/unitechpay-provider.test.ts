import { describe, it, expect, vi, afterEach } from 'vitest';
import { createHmac } from 'node:crypto';
import { env } from '../src/config/env.js';
import { UnitechPayProvider } from '../src/modules/payments/providers/unitechpay.provider.js';
import { AppError } from '../src/lib/errors/app-error.js';
import { ErrorCode } from '../src/lib/errors/error-codes.js';

// La clé factice vient de tests/helpers/setup-env.ts — aucun secret réel ici.
const API_KEY = process.env.UNITECHPAY_API_KEY as string;

function sign(data: { event: string; reference: string; amount: number; status: string; signed_at: number }): string {
  const signed = `${data.event}|${data.reference}|${data.amount}|${data.status}|${data.signed_at}`;
  return createHmac('sha256', API_KEY).update(signed).digest('hex');
}

function signedWebhook(overrides: Record<string, unknown> = {}) {
  const data: Record<string, unknown> = {
    event: 'payment_completed',
    transaction_id: 123456,
    reference: 'UNICH-REF',
    amount: 15000,
    status: 'completed',
    method: 'wave',
    commission: 300,
    net_amount: 14700,
    timestamp: 1699999999,
    signed_at: 1699999999,
    ...overrides,
  };
  data.signature = sign(data as never);
  return data;
}

const originalRelayUrl = env.UNITECHPAY_RELAY_URL;
const originalRelaySecret = env.UNITECHPAY_RELAY_SECRET;

afterEach(() => {
  env.UNITECHPAY_RELAY_URL = originalRelayUrl;
  env.UNITECHPAY_RELAY_SECRET = originalRelaySecret;
  vi.unstubAllGlobals();
});

describe('UnitechPayProvider.request via relais', () => {
  it('utilise UNITECHPAY_RELAY_URL et transmet le secret partage', async () => {
    env.UNITECHPAY_RELAY_URL = 'https://relay.test/api.php';
    env.UNITECHPAY_RELAY_SECRET = 'test-relay-secret-1234';
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          data: { transaction_id: 42, payment_url: 'https://pay.test/42' },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await new UnitechPayProvider().initiatePayment({
      amount: 15000,
      currency: 'XOF',
      reference: 'TX-TEST',
      description: 'Test relais',
      customer: { name: 'Awa', email: 'awa@test.invalid', phone: '+221770000000' },
      returnUrl: 'https://gamingmarket.store/return',
      notifyUrl: 'https://gamingmarket.store/webhook',
    });

    expect(result).toEqual({
      paymentUrl: 'https://pay.test/42',
      providerTransactionId: '42',
    });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://relay.test/api.php?action=create_wave_payment');
    const headers = init.headers as Record<string, string>;
    expect(headers['x-relay-secret']).toBe('test-relay-secret-1234');
    expect(headers.Authorization).toBe('Bearer test-unitechpay-api-key');
  });
});

describe('UnitechPayProvider.parseWebhook', () => {
  const provider = new UnitechPayProvider();

  it('accepts a valid signature and maps payment_completed -> CONFIRMED', async () => {
    const event = await provider.parseWebhook(signedWebhook(), {});

    expect(event.status).toBe('CONFIRMED');
    expect(event.providerEventId).toBe('123456-payment_completed');
    // C'est le transaction_id UnitechPay (stocké comme providerTransactionId
    // à l'initiation) qui sert de référence, pas data.reference.
    expect(event.reference).toBe('123456');
    expect(event.rawPayload).toBeTruthy();
  });

  it('remonte le montant signé, qui sert à valider la transaction', async () => {
    // Le montant fait partie de la chaîne signée : il est donc digne de
    // confiance et PaymentService.handleWebhook s'en sert pour refuser de
    // solder si l'encaissement ne correspond pas au montant attendu.
    const event = await provider.parseWebhook(signedWebhook({ amount: 15000 }), {});

    expect(event.amount).toBe(15000);
  });

  it('remonte un montant absent plutôt que NaN', async () => {
    const payload = signedWebhook();
    // On retire amount PUIS on resigne : la signature doit rester valide
    // (champ vide dans la chaîne canonique) mais le montant n'est pas
    // exploitable, donc parseWebhook ne doit pas remonter de nombre invalide.
    payload.amount = '';
    payload.signature = sign(payload as never);

    const event = await provider.parseWebhook(payload, {});

    expect(event.amount).toBeUndefined();
  });

  it('maps payment_failed -> FAILED and payment_expired -> CANCELLED', async () => {
    const failed = await provider.parseWebhook(
      signedWebhook({ event: 'payment_failed', status: 'failed' }),
      {},
    );
    expect(failed.status).toBe('FAILED');
    expect(failed.providerEventId).toBe('123456-payment_failed');

    const expired = await provider.parseWebhook(
      signedWebhook({ event: 'payment_expired', status: 'expired' }),
      {},
    );
    expect(expired.status).toBe('CANCELLED');
  });

  it('raises WEBHOOK_SIGNATURE_INVALID (401) when the signature is forged', async () => {
    const payload = signedWebhook();
    payload.signature = '0'.repeat(64);

    await expect(provider.parseWebhook(payload, {})).rejects.toBeInstanceOf(AppError);
    await expect(provider.parseWebhook(payload, {})).rejects.toMatchObject({
      code: ErrorCode.WEBHOOK_SIGNATURE_INVALID,
      statusCode: 401,
    });
  });

  it('raises VALIDATION_ERROR when required fields are missing', async () => {
    await expect(provider.parseWebhook({}, {})).rejects.toMatchObject({
      code: ErrorCode.VALIDATION_ERROR,
      statusCode: 400,
    });
  });
});