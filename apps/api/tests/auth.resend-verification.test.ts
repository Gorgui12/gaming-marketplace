import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UserAccountStatus, UserRole } from '@gm/types';
import { createFakeModel } from './helpers/fake-model.js';

const fakeUserModel = createFakeModel();

const sendEmailVerification = vi.fn(async () => {});

vi.mock('../src/modules/users/user.model.js', () => ({
  UserModel: fakeUserModel,
}));
vi.mock('../src/modules/audit/audit.service.js', () => ({
  AuditService: { log: vi.fn(async () => {}) },
}));
vi.mock('../src/modules/affiliates/affiliate-attribution.service.js', () => ({
  AffiliateAttributionService: { attachSessionToUser: vi.fn(async () => {}) },
}));
vi.mock('../src/lib/email/email.service.js', () => ({
  EmailService: { sendEmailVerification: sendEmailVerification },
}));

const { AuthService } = await import('../src/modules/auth/auth.service.js');

/**
 * Le renvoi du lien de confirmation est la porte de sortie du garde-fou
 * `requireEmailVerified`. Deux propriétés sont critiques et verrouillées ici :
 *
 *  1. SILENCE — un attaquant ne doit pas pouvoir découvrir quels emails sont
 *     inscrits, ni lesquels restent à valider. La méthode ne lève donc jamais
 *     pour un compte absent, déjà validé ou suspendu.
 *  2. NON-REMPISSAGE — l'API envoie un email VERS l'adresse fournie par
 *     l'appelant ; sans délai minimum, elle devient un outil de harcelement
 *     de boîtes tierces.
 */
async function seedUser(overrides: Record<string, unknown> = {}): Promise<string> {
  const user = await fakeUserModel.create({
    email: 'joueur@example.org',
    firstName: 'Awa',
    lastName: 'Diop',
    username: 'awadiop',
    status: UserAccountStatus.ACTIVE,
    roles: [UserRole.USER],
    emailVerified: false,
    ...overrides,
  });
  return String(user._id);
}

describe('AuthService.resendVerification', () => {
  beforeEach(() => {
    fakeUserModel.__reset();
    sendEmailVerification.mockClear();
  });

  it('envoie un nouveau lien à un compte non confirmé', async () => {
    const id = await seedUser();

    await AuthService.resendVerification({ email: 'joueur@example.org' }, id);

    expect(sendEmailVerification).toHaveBeenCalledTimes(1);
    const stored = fakeUserModel.__store.get(id)!;
    expect(stored.emailVerifyToken).toEqual(expect.any(String));
    expect(stored.emailVerifyExpires).toBeInstanceOf(Date);
  });

  it('retrouve le compte depuis la session, sans exiger l\'email', async () => {
    // Cas d'usage principal : l'utilisateur vient de s'inscrire, il a une
    // session ouverte, le client n'a donc aucune raison de connaître l'email.
    const id = await seedUser();

    await AuthService.resendVerification({}, id);

    expect(sendEmailVerification).toHaveBeenCalledTimes(1);
  });

  it('ne stocke que le hash du token, jamais le token envoyable', async () => {
    const id = await seedUser();

    await AuthService.resendVerification({}, id);

    const sentUrl: string = sendEmailVerification.mock.calls[0]![2];
    const rawToken = new URL(sentUrl).searchParams.get('token');
    const stored = String(fakeUserModel.__store.get(id)!.emailVerifyToken);

    expect(rawToken).toBeTruthy();
    expect(stored).not.toBe(rawToken);
    expect(stored).toHaveLength(64); // hex sha-256
  });

  it('ignore silencieusement un email inconnu (pas d\'énumération de comptes)', async () => {
    await seedUser();

    await expect(
      AuthService.resendVerification({ email: 'inconnu@example.org' }),
    ).resolves.toBeUndefined();
    expect(sendEmailVerification).not.toHaveBeenCalled();
  });

  it('ignore silencieusement un compte déjà confirmé', async () => {
    const id = await seedUser({ emailVerified: true });

    await AuthService.resendVerification({ email: 'joueur@example.org' }, id);

    expect(sendEmailVerification).not.toHaveBeenCalled();
  });

  it('ignore silencieusement un compte suspendu ou banni', async () => {
    for (const status of [UserAccountStatus.SUSPENDED, UserAccountStatus.BANNED]) {
      fakeUserModel.__reset();
      sendEmailVerification.mockClear();
      const id = await seedUser({ status });

      await AuthService.resendVerification({ email: 'joueur@example.org' }, id);

      expect(sendEmailVerification).not.toHaveBeenCalled();
    }
  });

  it('respecte un délai d\'une minute entre deux envois', async () => {
    const id = await seedUser();

    await AuthService.resendVerification({}, id);
    expect(sendEmailVerification).toHaveBeenCalledTimes(1);

    // Deuxième appel immédiat : ignoré, sinon la route devient un martèlement
    // de boîte tierce.
    await AuthService.resendVerification({}, id);
    expect(sendEmailVerification).toHaveBeenCalledTimes(1);
  });

  it('permet un nouvel envoi une fois le délai écoulé', async () => {
    const id = await seedUser();

    await AuthService.resendVerification({}, id);
    // On recule l'horodatage du dernier envoi au-delà de la fenêtre.
    const stored = fakeUserModel.__store.get(id)!;
    stored.emailVerifySentAt = new Date(Date.now() - 61_000);

    await AuthService.resendVerification({}, id);

    expect(sendEmailVerification).toHaveBeenCalledTimes(2);
  });

  it('exige un email quand aucune session n\'est disponible', async () => {
    await expect(AuthService.resendVerification({})).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
      statusCode: 400,
    });
  });
});
