import { timingSafeEqual } from 'node:crypto';

// Le reseau Render (Oregon) n'arrive pas a joindre api.unitech.sn, alors que
// celui de Vercel y parvient. Cette route sert de relais server-to-server :
// l'API Render l'appelle, elle appelle UnitechPay. La cle du prestataire
// n'est jamais stockee ici : elle est transmise dans l'en-tete Authorization
// de la requete entrante, et le relais exige en plus un secret partage pour
// ne pas devenir un proxy public.

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Le provider repond en < 2 s ; cette marge couvre un incident passager sans
// laisser la fonction Vercel tuer la requete avant notre propre timeout.
export const maxDuration = 30;

const UPSTREAM = 'https://api.unitech.sn/api.php';
const TIMEOUT_MS = 20_000;
const ALLOWED_ACTIONS = new Set(['create_wave_payment', 'transactions']);

function jsonError(status: number, code: string, message: string): Response {
  return Response.json({ success: false, error: { code, message } }, { status });
}

function secretMatches(received: string | null, expected: string): boolean {
  if (!received) return false;
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function handle(request: Request): Promise<Response> {
  const secret = process.env.UNITECHPAY_RELAY_SECRET;
  if (!secret || secret.length < 16) {
    console.error('[unitechpay-relay] UNITECHPAY_RELAY_SECRET absent ou trop court');
    return jsonError(500, 'RELAY_NOT_CONFIGURED', 'Relais non configure');
  }
  if (!secretMatches(request.headers.get('x-relay-secret'), secret)) {
    return jsonError(401, 'UNAUTHORIZED', 'Relais non autorise');
  }

  const action = new URL(request.url).searchParams.get('action');
  if (!action || !ALLOWED_ACTIONS.has(action)) {
    return jsonError(400, 'INVALID_ACTION', 'Action non autorisee');
  }
  if (action === 'create_wave_payment' && request.method !== 'POST') {
    return jsonError(405, 'METHOD_NOT_ALLOWED', 'Methode non autorisee');
  }
  if (action === 'transactions' && request.method !== 'GET') {
    return jsonError(405, 'METHOD_NOT_ALLOWED', 'Methode non autorisee');
  }

  const authorization = request.headers.get('authorization');
  if (!authorization) {
    return jsonError(401, 'MISSING_AUTHORIZATION', 'Cle prestataire manquante');
  }

  const headers = new Headers({ authorization });
  const contentType = request.headers.get('content-type');
  if (contentType) headers.set('content-type', contentType);

  const body = request.method === 'POST' ? await request.arrayBuffer() : undefined;

  try {
    const upstream = await fetch(`${UPSTREAM}?action=${encodeURIComponent(action)}`, {
      method: request.method,
      headers,
      body,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const text = await upstream.text();
    return new Response(text, {
      status: upstream.status,
      headers: {
        'content-type': upstream.headers.get('content-type') ?? 'application/json',
        'cache-control': 'no-store',
      },
    });
  } catch (err) {
    const cause = (err as { cause?: { code?: string; message?: string } }).cause;
    console.error('[unitechpay-relay] echec appel UnitechPay', {
      action,
      name: err instanceof Error ? err.name : undefined,
      message: err instanceof Error ? err.message : undefined,
      cause: cause?.code ?? cause?.message,
    });
    return jsonError(502, 'UPSTREAM_UNAVAILABLE', 'Prestataire de paiement inaccessible');
  }
}

export function GET(request: Request): Promise<Response> {
  return handle(request);
}

export function POST(request: Request): Promise<Response> {
  return handle(request);
}
