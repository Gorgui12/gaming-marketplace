import { describe, it, expect } from 'vitest';
import type { NextFunction, Request, Response } from 'express';
import { csrfGuard } from '../src/middlewares/csrf.middleware.js';
import { corsAllowedOrigins } from '../src/config/env.js';

/**
 * P0-3 — le cookie de session est SameSite=None (site et admin sur deux
 * domaines) et le CORS n'empêche pas l'exécution d'une requête cross-origin
 * (il omet seulement les en-têtes de réponse). Sans contrôle d'Origin, un
 * <form method="POST"> sur un site tiers suffisait à atteindre les routes
 * destructives, y compris POST /admin/db/reset.
 */
function runCsrfGuard(opts: {
  method: string;
  origin?: string;
  path?: string;
}) {
  const req = {
    method: opts.method,
    path: opts.path ?? '/api/v1/admin/db/reset',
    headers: opts.origin === undefined ? {} : { origin: opts.origin },
  } as unknown as Request;
  const res = {} as Response;

  let passed = false;
  let error: unknown;
  const next = ((err?: unknown) => {
    if (err) error = err;
    else passed = true;
  }) as NextFunction;

  csrfGuard(req, res, next);
  return { passed, error };
}

const ALLOWED = corsAllowedOrigins[0]!;

describe('csrfGuard', () => {
  it('laisse passer une mutation depuis une origine autorisée', () => {
    const { passed, error } = runCsrfGuard({ method: 'POST', origin: ALLOWED });

    expect(passed).toBe(true);
    expect(error).toBeUndefined();
  });

  it('bloque une mutation depuis une origine tierce (attaque CSRF)', () => {
    const { passed, error } = runCsrfGuard({
      method: 'POST',
      origin: 'https://evil.example.com',
    });

    expect(passed).toBe(false);
    expect(error).toMatchObject({ statusCode: 403 });
  });

  it('bloque y compris sur la route de wipe de base', () => {
    const { error } = runCsrfGuard({
      method: 'POST',
      origin: 'https://evil.example.com',
      path: '/api/v1/admin/db/reset',
    });

    expect(error).toMatchObject({ statusCode: 403 });
  });

  it('couvre toutes les méthodes à effet de bord', () => {
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      const { passed, error } = runCsrfGuard({ method, origin: 'https://evil.example.com' });

      expect(passed, `${method} doit être protégé`).toBe(false);
      expect(error).toMatchObject({ statusCode: 403 });
    }
  });

  it('ne touche pas aux méthodes sûres', () => {
    for (const method of ['GET', 'HEAD', 'OPTIONS']) {
      const { passed, error } = runCsrfGuard({ method, origin: 'https://evil.example.com' });

      expect(passed, `${method} doit passer`).toBe(true);
      expect(error).toBeUndefined();
    }
  });

  it('laisse passer une mutation sans Origin (client non-navigateur, SSR)', () => {
    // Un navigateur envoie TOUJOURS Origin sur une requête cross-site
    // dangereuse : l'absence de cet en-tête ne peut pas venir d'une attaque
    // CSRF, seulement d'un client serveur (curl, appel SSR des fronts).
    const { passed, error } = runCsrfGuard({ method: 'POST' });

    expect(passed).toBe(true);
    expect(error).toBeUndefined();
  });

  it('exempte les webhooks fournisseurs (serveur à serveur, signés)', () => {
    for (const path of [
      '/api/v1/payments/unitechpay/webhook',
      '/api/v1/payments/paydunya/ipn',
    ]) {
      const { passed } = runCsrfGuard({ method: 'POST', path });

      expect(passed, `${path} doit rester accessible au provider`).toBe(true);
    }
  });

  it('normalise la casse de l\'origine', () => {
    const { passed } = runCsrfGuard({
      method: 'POST',
      origin: ALLOWED.toUpperCase(),
    });

    expect(passed).toBe(true);
  });

  it('prend la première origine quand l\'en-tête en liste plusieurs', () => {
    const { passed, error } = runCsrfGuard({
      method: 'POST',
      origin: `${ALLOWED} https://evil.example.com`,
    });

    expect(passed).toBe(true);
    expect(error).toBeUndefined();
  });
});
