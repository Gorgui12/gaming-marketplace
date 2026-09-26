import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextFunction, Request, Response } from 'express';
import { createFakeModel } from './helpers/fake-model.js';
import { UserAccountStatus, UserRole } from '@gm/types';

const fakeUserModel = createFakeModel();

vi.mock('../src/modules/users/user.model.js', () => ({
  UserModel: fakeUserModel,
}));

const { attachUser } = await import('../src/middlewares/auth.middleware.js');
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

    expect(req.user).toEqual({ id, roles: [UserRole.USER] });
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

    expect(req.user).toEqual({ id, roles: [UserRole.USER] });
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
