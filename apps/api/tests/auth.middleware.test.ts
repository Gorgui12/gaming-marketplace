import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextFunction, Request, Response } from 'express';
import { createFakeModel } from './helpers/fake-model.js';
import { UserAccountStatus, UserRole } from '@gm/types';

const fakeUserModel = createFakeModel();

vi.mock('../src/modules/users/user.model.js', () => ({
  UserModel: fakeUserModel,
}));

const { attachUser, requireEmailVerified } = await import('../src/middlewares/auth.middleware.js');
const { createSessionToken } = await import('../src/modules/auth/session.js');

/**
 * P0-2 — le cookie de session est un token stateless : sans relecture de la
 * base à chaque requête, un bannissement ou une rétrogradation de rôle
 * restait sans effet pendant SESSION_TTL_DAYS (7 jours). Ces tests verrouillent
 * les trois garanties rendues par attachUser :
 *  - compte non ACTIVE -> plus de session ;
 *  - rôles lus en base, pas ceux figés dans le cookie ;
 *  - sessionVersion différent -> cookie considéré comme révoqué.
 */
function runAttachUser(token: string | undefined): Promise<Request> {
  const req = {
    cookies: token === undefined ? {} : { gm_session: token },
  } as unknown as Request;
  const res = {} as Response;
  return new Promise<void>((resolve) => {
    const next = ((err?: unknown) => {
      if (err) throw err;
      resolve();
    }) as NextFunction;
    attachUser(req, res, next);
  }).then(() => req);
}

async function seedUser(overrides: Record<string, unknown> = {}): Promise<string> {
  await fakeUserModel.create({
    status: UserAccountStatus.ACTIVE,
    roles: [UserRole.USER],
    sessionVersion: 0,
    ...overrides,
  });
  // create() génère son propre _id : on aligne l'id du token dessus.
  const created = [...fakeUserModel.__store.values()][0]!;
  return String(created._id);
}

describe('attachUser — révocation et bannissement', () => {
  beforeEach(() => {
    fakeUserModel.__reset();
  });

  it('authentifie un compte ACTIVE', async () => {
    const id = await seedUser({ roles: [UserRole.USER] });
    const req = await runAttachUser(createSessionToken(id, [UserRole.USER], 0));

    expect(req.user).toEqual({ id, roles: [UserRole.USER], emailVerified: true });
  });

  it('refuse un compte BANNED même avec un cookie valide', async () => {
    const id = await seedUser({ status: UserAccountStatus.BANNED });
    const req = await runAttachUser(createSessionToken(id, [UserRole.USER], 0));

    expect(req.user).toBeUndefined();
  });

  it('refuse un compte SUSPENDED', async () => {
    const id = await seedUser({ status: UserAccountStatus.SUSPENDED });
    const req = await runAttachUser(createSessionToken(id, [UserRole.USER], 0));

    expect(req.user).toBeUndefined();
  });

  it('utilise les rôles en base et non ceux du cookie (rétrogradation effective)', async () => {
    // Le cookie a été émis quand l'utilisateur était SUPER_ADMIN ; en base il
    // ne l'est plus. Sans relecture, l'ancien rôle donnerait encore accès à
    // toutes les routes /admin pendant 7 jours.
    const id = await seedUser({ roles: [UserRole.USER] });
    const req = await runAttachUser(createSessionToken(id, [UserRole.SUPER_ADMIN], 0));

    expect(req.user?.roles).toEqual([UserRole.USER]);
    expect(req.user?.roles).not.toContain(UserRole.SUPER_ADMIN);
  });

  it('rejette un cookie dont sessionVersion a été invalidé', async () => {
    const id = await seedUser({ sessionVersion: 1 });
    const req = await runAttachUser(createSessionToken(id, [UserRole.USER], 0));

    expect(req.user).toBeUndefined();
  });

  it('accepte le cookie réémis avec la version courante', async () => {
    const id = await seedUser({ sessionVersion: 2 });
    const req = await runAttachUser(createSessionToken(id, [UserRole.USER], 2));

    expect(req.user).toEqual({ id, roles: [UserRole.USER], emailVerified: true });
  });

  it('ignore un utilisateur absent de la base', async () => {
    const req = await runAttachUser(createSessionToken('ghost-id', [UserRole.USER], 0));

    expect(req.user).toBeUndefined();
  });

  it('ignore une requête sans cookie', async () => {
    const req = await runAttachUser(undefined);

    expect(req.user).toBeUndefined();
  });
});

/**
 * emailVerified est relu en base à chaque requête, exactement comme `status`.
 * C'est indispensable : le cookie est émis AVANT la confirmation (pour laisser
 * naviguer), donc un cookie ancien ne peut pas transporter un « non vérifié »
 * figé — l'utilisateur resterait bloqué même après avoir cliqué sur le lien.
 */
describe('attachUser — emailVerified', () => {
  beforeEach(() => {
    fakeUserModel.__reset();
  });

  it('propage emailVerified: false pour un compte non confirmé', async () => {
    const id = await seedUser({ emailVerified: false });
    const req = await runAttachUser(createSessionToken(id, [UserRole.USER], 0));

    expect(req.user?.emailVerified).toBe(false);
  });

  it('propage emailVerified: true', async () => {
    const id = await seedUser({ emailVerified: true });
    const req = await runAttachUser(createSessionToken(id, [UserRole.USER], 0));

    expect(req.user?.emailVerified).toBe(true);
  });

  it('bascule à true dès la requête suivant une confirmation, sans réémettre de cookie', async () => {
    const id = await seedUser({ emailVerified: false });
    const token = createSessionToken(id, [UserRole.USER], 0);

    const avant = await runAttachUser(token);
    expect(avant.user?.emailVerified).toBe(false);

    // L'utilisateur clique sur le lien : la base passe à true.
    const stored = fakeUserModel.__store.get(id);
    stored!.emailVerified = true;

    // MÊME cookie qu'avant la confirmation.
    const apres = await runAttachUser(token);
    expect(apres.user?.emailVerified).toBe(true);
  });

  it('traite un compte sans le champ comme vérifié (pas de blocage rétroactif)', async () => {
    // Les comptes créés avant l'introduction de la confirmation n'ont pas le
    // champ en base. Les bloquer tous d'un coup à la mise en production
    // casserait des comptes légitimes d'un coup : ils doivent passer.
    const id = await seedUser({});
    expect(fakeUserModel.__store.get(id)!.emailVerified).toBeUndefined();

    const req = await runAttachUser(createSessionToken(id, [UserRole.USER], 0));

    expect(req.user?.emailVerified).toBe(true);
  });
});

function runRequireEmailVerified(req: Request): Promise<Error | undefined> {
  const res = {} as Response;
  return new Promise((resolve) => {
    const next = ((err?: unknown) => {
      resolve(err as Error | undefined);
    }) as NextFunction;
    requireEmailVerified(req, res, next);
  });
}

function reqAs(user: { id: string; roles: string[]; emailVerified: boolean } | undefined): Request {
  return { user } as unknown as Request;
}

describe('requireEmailVerified', () => {
  it('laisse passer un compte confirmé', async () => {
    const err = await runRequireEmailVerified(
      reqAs({ id: 'u1', roles: [UserRole.USER], emailVerified: true }),
    );

    expect(err).toBeUndefined();
  });

  it('refuse un compte non confirmé avec EMAIL_NOT_VERIFIED en 403', async () => {
    const err = await runRequireEmailVerified(
      reqAs({ id: 'u1', roles: [UserRole.USER], emailVerified: false }),
    );

    expect(err).toBeDefined();
    expect((err as { code?: string }).code).toBe('EMAIL_NOT_VERIFIED');
    expect((err as { statusCode?: number }).statusCode).toBe(403);
  });

  it('refuse une requête non authentifiée (401, pas 403)', async () => {
    // requireEmailVerified est posé APRÈS requireAuth dans toutes les routes,
    // mais il ne doit pas se comporter en laisse-passer si on l'oublie.
    const err = await runRequireEmailVerified(reqAs(undefined));

    expect((err as { statusCode?: number }).statusCode).toBe(401);
  });
});
