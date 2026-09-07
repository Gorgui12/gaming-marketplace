import { describe, it, expect } from 'vitest';
import { createHmac } from 'node:crypto';
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