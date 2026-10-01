import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createFakeModel } from './helpers/fake-model.js';
import type { BroadcastRecipient } from '../src/lib/email/email-broadcast.service.js';

const fakeUserModel = createFakeModel();
const fakeSendModel = createFakeModel();

vi.mock('../src/modules/users/user.model.js', () => ({ UserModel: fakeUserModel }));
vi.mock('../src/modules/admin/admin-email-send.model.js', () => ({
  AdminEmailSendModel: fakeSendModel,
}));

const sendAdminBroadcast = vi.fn().mockResolvedValue(undefined);
vi.mock('../src/lib/email/email.service.js', () => ({
  EmailService: { sendAdminBroadcast },
}));

const {
  previewBroadcast,
  reapStaleRuns,
  selectRecipients,
  sendTestBroadcast,
  startBroadcast,
} = await import('../src/lib/email/email-broadcast.service.js');

const hex64 = 'a'.repeat(64);

/** Seuil par défaut de `ADMIN_EMAIL_BULK_THRESHOLD` : 50. */
const BULK_THRESHOLD = 50;

/** Compte commercialement recevable : consentant, vérifié, actif, avec token. */
async function seedOptedInUser(i: number) {
  return fakeUserModel.create({
    email: `user${i}@test.sn`,
    firstName: `User${i}`,
    emailVerified: true,
    status: 'ACTIVE',
    marketing: { optedIn: true, updatedAt: new Date(), unsubscribeToken: hex64 },
  });
}

async function seedActiveUser(i: number) {
  return fakeUserModel.create({
    email: `actif${i}@test.sn`,
    firstName: `Actif${i}`,
    lastName: 'Test',
    username: `actif${i}`,
    country: 'SN',
    currency: 'XOF',
    emailVerified: true,
    status: 'ACTIVE',
  });
}

/** Destinataire forcé, pour tester sans peupler la base. */
function recipient(overrides: Partial<BroadcastRecipient> = {}): BroadcastRecipient {
  return {
    _id: 'id',
    email: 'cible@test.sn',
    firstName: 'Cible',
    lastName: 'Test',
    username: 'cible',
    country: 'SN',
    currency: 'XOF',
    unsubscribeUrl: '',
    ...overrides,
  };
}

/**
 * Laisse le traitement d'arrière-plan se terminer.
 *
 * `startBroadcast` ne rend pas la main sur la boucle d'envoi — c'est le
 * principe même de l'asynchronie (la route répond 202 avant le premier
 * contact). `vi.waitFor` est donc la seule façon correcte d'attendre la fin
 * réelle plutôt qu'un nombre de ticks arbitraire qui masquerait une régression
 * sur la latence.
 */
async function settle() {
  await vi.waitFor(() => {
    const pending = [...fakeSendModel.__store.values()].filter(
      (d) => d.status === 'RUNNING',
    );
    expect(pending).toHaveLength(0);
  });
}

beforeEach(() => {
  fakeUserModel.__reset();
  fakeSendModel.__reset();
  sendAdminBroadcast.mockClear();
  sendAdminBroadcast.mockResolvedValue(undefined);
});

describe('selectRecipients', () => {
  it("n'inclut en commercial que les comptes ayant consenti", async () => {
    await seedOptedInUser(1);
    await seedActiveUser(2);

    const recipients = await selectRecipients('COMMERCIAL');

    expect(recipients).toHaveLength(1);
    expect(recipients[0]?.email).toBe('user1@test.sn');
    // Un consentement sans lien de désinscription produirait un email
    // commercial sans issue pour le lecteur.
    expect(recipients[0]?.unsubscribeUrl).toContain(hex64);
  });

  it('exclut de tout envoi les comptes non vérifiés, inactifs ou désabonnés', async () => {
    await fakeUserModel.create({
      email: 'nonverifie@test.sn',
      firstName: 'Non',
      emailVerified: false,
      status: 'ACTIVE',
    });
    await fakeUserModel.create({
      email: 'banni@test.sn',
      firstName: 'Banni',
      emailVerified: true,
      status: 'BANNED',
    });
    await fakeUserModel.create({
      email: 'desabonne@test.sn',
      firstName: 'Des',
      emailVerified: true,
      status: 'ACTIVE',
      marketing: { optedIn: false, updatedAt: new Date() },
    });
    await seedOptedInUser(1);

    const recipients = await selectRecipients('COMMERCIAL');

    expect(recipients.map((r) => r.email)).toEqual(['user1@test.sn']);
  });

  it("inclut en transactionnel les comptes désabonnés, sans lien de désinscription", async () => {
    await fakeUserModel.create({
      email: 'desabonne@test.sn',
      firstName: 'Des',
      emailVerified: true,
      status: 'ACTIVE',
      marketing: { optedIn: false, updatedAt: new Date() },
    });

    const recipients = await selectRecipients('TRANSACTIONAL');

    // Quelqu'un qui s'est désinscrit d'un mail promo doit quand même recevoir
    // une alerte de maintenance.
    expect(recipients.map((r) => r.email)).toEqual(['desabonne@test.sn']);
    expect(recipients[0]?.unsubscribeUrl).toBe('');
  });
});

describe('previewBroadcast', () => {
  it('interpole les variables et signale les problèmes', () => {
    const res = previewBroadcast({
      html: '<p>Bonjour {{firstName}}</p><a href="{{unsubscribeUrl}}">stop</a>',
      kind: 'COMMERCIAL',
    });

    expect(res.html).toContain('Bonjour Awa');
    expect(res.issues.unknown).toEqual([]);
    expect(res.issues.missingUnsubscribe).toBe(false);
  });

  it('signale une variable inconnue et un commercial sans lien de désinscription', () => {
    const res = previewBroadcast({ html: '<p>{{fistName}}</p>', kind: 'COMMERCIAL' });

    // Le front doit pouvoir relire un brouillon avant d'avoir ajouté le lien :
    // l'aperçu signale, il ne bloque pas.
    expect(res.issues.unknown).toEqual(['fistName']);
    expect(res.issues.missingUnsubscribe).toBe(true);
  });

  it('désinfecte avant de rendre', () => {
    const res = previewBroadcast({
      html: '<img src="x" onerror="alert(1)">Bonjour',
      kind: 'TRANSACTIONAL',
    });

    expect(res.html).not.toContain('onerror');
  });

  it('produit une version texte exploitable', () => {
    const res = previewBroadcast({
      html: '<h1>Titre</h1><p>Corps</p>',
      kind: 'TRANSACTIONAL',
    });

    expect(res.text).toContain('Titre');
    expect(res.text).toContain('Corps');
  });
});

describe('startBroadcast', () => {
  it("refuse un commercial sans lien de désinscription avant tout envoi", async () => {
    await expect(
      startBroadcast({
        subject: 'Offre',
        html: '<p>Bonjour {{firstName}}</p>',
        kind: 'COMMERCIAL',
        initiatedBy: 'admin:web',
      }),
    ).rejects.toThrow(/unsubscribeUrl/);

    expect(sendAdminBroadcast).not.toHaveBeenCalled();
    expect(fakeSendModel.__store.size).toBe(0);
  });

  it("refuse une variable inconnue avant tout envoi, en citant les variables acceptées", async () => {
    await expect(
      startBroadcast({
        subject: 'Info',
        html: '<p>{{fistName}}</p>',
        kind: 'TRANSACTIONAL',
        initiatedBy: 'admin:web',
      }),
    ).rejects.toThrow(/fistName/);

    expect(sendAdminBroadcast).not.toHaveBeenCalled();
  });

  it('refuse un envoi dont le corps est vide après désinfection', async () => {
    await expect(
      startBroadcast({
        subject: 'Info',
        html: '<script>alert(1)</script>',
        kind: 'TRANSACTIONAL',
        initiatedBy: 'admin:web',
      }),
    ).rejects.toThrow(/vide/i);
  });

  it('refuse quand personne ne correspond au type d\'envoi', async () => {
    // Transactionnel : le contrôle du lien de désinscription, qui passe avant,
    // ne doit pas masquer le cas testé.
    await expect(
      startBroadcast({
        subject: 'Info',
        html: '<p>Bonjour</p>',
        kind: 'TRANSACTIONAL',
        initiatedBy: 'admin:web',
      }),
    ).rejects.toThrow(/Aucun destinataire/);
  });

  it('exige une confirmation au-delà du seuil, avec le nombre exact', async () => {
    for (let i = 0; i < BULK_THRESHOLD; i += 1) await seedOptedInUser(i);

    const attempt = startBroadcast({
      subject: 'Offre',
      html: '<p>Bonjour {{firstName}} <a href="{{unsubscribeUrl}}">stop</a></p>',
      kind: 'COMMERCIAL',
      initiatedBy: 'admin:web',
    });

    await expect(attempt).rejects.toThrow(new RegExp(`${BULK_THRESHOLD} destinataires`));
    expect(sendAdminBroadcast).not.toHaveBeenCalled();
    // Un refus ne doit rien laisser dans l'historique : aucun envoi n'a commencé.
    expect(fakeSendModel.__store.size).toBe(0);
  });

  it('accepte un envoi massif une fois la confirmation donnée', async () => {
    for (let i = 0; i < BULK_THRESHOLD; i += 1) await seedOptedInUser(i);

    const { recipientCount } = await startBroadcast({
      subject: 'Offre',
      html: '<p>Bonjour {{firstName}} <a href="{{unsubscribeUrl}}">stop</a></p>',
      kind: 'COMMERCIAL',
      initiatedBy: 'admin:web',
      confirmedLargeSend: true,
    });

    expect(recipientCount).toBe(BULK_THRESHOLD);
    await settle();
    expect(sendAdminBroadcast).toHaveBeenCalledTimes(BULK_THRESHOLD);
  });

  it('n\'exige pas la confirmation sous le seuil', async () => {
    await seedOptedInUser(1);

    await startBroadcast({
      subject: 'Offre',
      html: '<p>Bonjour <a href="{{unsubscribeUrl}}">stop</a></p>',
      kind: 'COMMERCIAL',
      initiatedBy: 'admin:web',
    });

    await settle();
    expect(sendAdminBroadcast).toHaveBeenCalledTimes(1);
  });

  it('interpole les variables par destinataire', async () => {
    await startBroadcast({
      subject: 'Info',
      html: '<p>Bonjour {{firstName}}</p>',
      kind: 'TRANSACTIONAL',
      initiatedBy: 'admin:web',
      recipientsOverride: [recipient({ email: 'a@test.sn', firstName: 'Awa' }), recipient({ email: 'b@test.sn', firstName: 'Moussa' })],
    });

    await settle();
    const sent = sendAdminBroadcast.mock.calls.map((c) => c[0] as { html: string });
    expect(sent.map((s) => s.html)).toEqual([
      '<p>Bonjour Awa</p>',
      '<p>Bonjour Moussa</p>',
    ]);
  });

  it('poursuit l\'envoi malgré un destinataire en échec et conclut en PARTIAL', async () => {
    sendAdminBroadcast.mockImplementation(async ({ to }: { to: string }) => {
      if (to === 'b@test.sn') throw new Error('adresse invalide');
    });

    const { sendId } = await startBroadcast({
      subject: 'Info',
      html: '<p>Bonjour</p>',
      kind: 'TRANSACTIONAL',
      initiatedBy: 'admin:web',
      recipientsOverride: [recipient({ email: 'a@test.sn' }), recipient({ email: 'b@test.sn' }), recipient({ email: 'c@test.sn' })],
    });

    await settle();
    const doc = fakeSendModel.__store.get(sendId);
    // Une adresse morte ne doit pas interrompre les suivantes : c'est tout
    // l'intérêt du try/catch par destinataire.
    expect(sendAdminBroadcast).toHaveBeenCalledTimes(3);
    expect(doc?.status).toBe('PARTIAL');
    expect(doc?.successCount).toBe(2);
    expect(doc?.failureCount).toBe(1);
    expect(doc?.lastError).toContain('adresse invalide');
  });

  it('conclut en FAILED quand aucun destinataire ne reçoit le message', async () => {
    sendAdminBroadcast.mockRejectedValue(new Error('Resend indisponible'));

    const { sendId } = await startBroadcast({
      subject: 'Info',
      html: '<p>Bonjour</p>',
      kind: 'TRANSACTIONAL',
      initiatedBy: 'admin:web',
      recipientsOverride: [recipient()],
    });

    await settle();
    expect(fakeSendModel.__store.get(sendId)?.status).toBe('FAILED');
  });

  it('conclut en COMPLETED quand tout est parti', async () => {
    const { sendId } = await startBroadcast({
      subject: 'Info',
      html: '<p>Bonjour</p>',
      kind: 'TRANSACTIONAL',
      initiatedBy: 'admin:web',
      recipientsOverride: [recipient()],
    });

    await settle();
    const doc = fakeSendModel.__store.get(sendId);
    expect(doc?.status).toBe('COMPLETED');
    expect(doc?.initiatedBy).toBe('admin:web');
    expect(doc?.recipientCount).toBe(1);
  });

  it('conserve le corps d\'origine à côté du corps désinfecté', async () => {
    const raw = '<script>alert(1)</script><p>Bonjour</p>';

    const { sendId } = await startBroadcast({
      subject: 'Info',
      html: raw,
      kind: 'TRANSACTIONAL',
      initiatedBy: 'admin:web',
      recipientsOverride: [recipient()],
    });

    await settle();
    const doc = fakeSendModel.__store.get(sendId);
    expect(doc?.rawHtml).toBe(raw);
    expect(String(doc?.html)).not.toContain('script');
  });
});

describe('sendTestBroadcast', () => {
  it('n\'écrit rien dans l\'historique', async () => {
    await sendTestBroadcast({
      to: 'moi@test.sn',
      subject: 'Info',
      html: '<p>Bonjour {{firstName}}</p>',
      kind: 'TRANSACTIONAL',
    });

    expect(sendAdminBroadcast).toHaveBeenCalledTimes(1);
    // Un test n'est pas un envoi : le polluer ferait perdre le fil de ce qui
    // est vraiment parti.
    expect(fakeSendModel.__store.size).toBe(0);
  });

  it('refuse une variable inconnue sans rien envoyer', async () => {
    await expect(
      sendTestBroadcast({
        to: 'moi@test.sn',
        subject: 'Info',
        html: '<p>{{fistName}}</p>',
        kind: 'TRANSACTIONAL',
      }),
    ).rejects.toThrow(/fistName/);

    expect(sendAdminBroadcast).not.toHaveBeenCalled();
  });

  it('accepte un commercial sans lien dans le corps, grâce à une URL de substitution', async () => {
    await sendTestBroadcast({
      to: 'moi@test.sn',
      subject: 'Offre',
      html: '<p>Bonjour</p>',
      kind: 'COMMERCIAL',
    });

    // Le test valide le rendu, pas la conformité d'envoi : exiger le lien dans
    // le corps empêcherait de vérifier une mise en page avant de l'avoir finie.
    expect(sendAdminBroadcast).toHaveBeenCalledTimes(1);
  });
});

describe('reapStaleRuns', () => {
  it('marque FAILED un envoi RUNNING plus vieux que le délai', async () => {
    await fakeSendModel.create({
      subject: 'Ancien',
      kind: 'TRANSACTIONAL',
      html: '<p>x</p>',
      status: 'RUNNING',
      createdAt: new Date(Date.now() - 31 * 60 * 1000),
    });

    const reaped = await reapStaleRuns();

    expect(reaped).toBe(1);
    expect([...fakeSendModel.__store.values()][0]?.status).toBe('FAILED');
  });

  it('laisse un envoi RUNNING récent en cours', async () => {
    await fakeSendModel.create({
      subject: 'En cours',
      kind: 'TRANSACTIONAL',
      html: '<p>x</p>',
      status: 'RUNNING',
      createdAt: new Date(),
    });

    expect(await reapStaleRuns()).toBe(0);
    expect([...fakeSendModel.__store.values()][0]?.status).toBe('RUNNING');
  });
});
