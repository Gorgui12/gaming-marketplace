import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createFakeModel } from './helpers/fake-model.js';

const fakeUserModel = createFakeModel();
const fakeListingModel = createFakeModel();
const fakeCampaignModel = createFakeModel();

vi.mock('../src/modules/users/user.model.js', () => ({ UserModel: fakeUserModel }));
vi.mock('../src/modules/listings/listing.model.js', () => ({ ListingModel: fakeListingModel }));
vi.mock('../src/modules/newsletter/newsletter-campaign.model.js', () => ({
  NewsletterCampaignModel: fakeCampaignModel,
}));

const sendWeeklyTopListings = vi.fn().mockResolvedValue(undefined);
vi.mock('../src/lib/email/email.service.js', () => ({
  EmailService: { sendWeeklyTopListings },
}));

const log = vi.fn().mockResolvedValue(undefined);
vi.mock('../src/modules/audit/audit.service.js', () => ({
  AuditService: { log },
}));

const { NewsletterService } = await import('../src/modules/newsletter/newsletter.service.js');
const { MarketingConsentService } = await import(
  '../src/modules/newsletter/marketing-consent.service.js'
);

const hex64 = 'a'.repeat(64);

/** Compte consentant et vérifié, seul profil recevable. */
async function seedOptedInUser(email = 'optin@test.sn') {
  return fakeUserModel.create({
    email,
    firstName: 'Awa',
    emailVerified: true,
    status: 'ACTIVE',
    marketing: { optedIn: true, updatedAt: new Date(), unsubscribeToken: hex64 },
  });
}

/**
 * Une annonce éligible, datée de `now`.
 *
 * Déclaration au niveau module : utilisée à la fois par les tests d'envoi et
 * par ceux de planification, qui ont besoin de la même annonce sans dépendre
 * de l'ordre d'exécution des blocs `describe`.
 */
async function seedOneListing(now: Date, views = 300) {
  return fakeListingModel.create({
    title: 'Annonce vedette',
    slug: 'vedette',
    price: 20_000,
    currency: 'XOF',
    game: { name: 'eFootball', slug: 'efootball' },
    country: 'SN',
    views,
    status: 'PUBLISHED',
    createdAt: now,
  });
}

beforeEach(() => {
  fakeUserModel.__reset();
  fakeListingModel.__reset();
  fakeCampaignModel.__reset();
  sendWeeklyTopListings.mockClear();
  sendWeeklyTopListings.mockResolvedValue(undefined);
  log.mockClear();
});

describe('NewsletterService.campaignKey', () => {
  it('produit une cle stable pour deux appels le meme jour', () => {
    const a = NewsletterService.campaignKey(new Date('2026-03-10T08:00:00Z'));
    const b = NewsletterService.campaignKey(new Date('2026-03-10T21:00:00Z'));
    expect(a).toBe(b);
  });

  it('distingue deux jours de la meme semaine', () => {
    const mardi = NewsletterService.campaignKey(new Date('2026-03-10T08:00:00Z'));
    const vendredi = NewsletterService.campaignKey(new Date('2026-03-13T08:00:00Z'));
    expect(mardi).not.toBe(vendredi);
  });

  it('numerote la semaine ISO correctement (2026-01-01 est un jeudi, semaine 1)', () => {
    expect(NewsletterService.campaignKey(new Date('2026-01-01T12:00:00Z'))).toMatch(
      /^2026-W01-\d$/,
    );
  });

  it('place le lundi en 1 et le dimanche en 7', () => {
    // 2026-03-09 est un lundi, 2026-03-15 un dimanche.
    expect(NewsletterService.campaignKey(new Date('2026-03-09T12:00:00Z'))).toMatch(/-1$/);
    expect(NewsletterService.campaignKey(new Date('2026-03-15T12:00:00Z'))).toMatch(/-7$/);
  });
});

describe('NewsletterService.selectListings', () => {
  it('ne garde que les annonces publiees, fraiches et au-dessus du seuil', async () => {
    const now = new Date('2026-03-10T12:00:00Z');
    const fresh = (d: number) => new Date(now.getTime() - d * 86400000);

    await fakeListingModel.create({
      title: 'Retenue',
      slug: 'retenue',
      price: 15_000,
      currency: 'XOF',
      game: { name: 'eFootball', slug: 'efootball' },
      country: 'SN',
      views: 500,
      status: 'PUBLISHED',
      createdAt: fresh(1),
    });
    await fakeListingModel.create({
      title: 'Trop peu de vues',
      slug: 'peu-vues',
      price: 10_000,
      currency: 'XOF',
      game: { name: 'eFootball', slug: 'efootball' },
      country: 'SN',
      views: 2,
      status: 'PUBLISHED',
      createdAt: fresh(1),
    });
    await fakeListingModel.create({
      title: 'Trop ancienne',
      slug: 'ancienne',
      price: 12_000,
      currency: 'XOF',
      game: { name: 'eFootball', slug: 'efootball' },
      country: 'SN',
      views: 900,
      status: 'PUBLISHED',
      createdAt: fresh(20),
    });
    await fakeListingModel.create({
      title: 'Pas publiee',
      slug: 'brouillon',
      price: 9_000,
      currency: 'XOF',
      game: { name: 'eFootball', slug: 'efootball' },
      country: 'SN',
      views: 800,
      status: 'PENDING',
      createdAt: fresh(1),
    });

    const result = await NewsletterService.selectListings(now);
    expect(result.map((l) => l.title)).toEqual(['Retenue']);
  });

  it('classe par vues decroissantes et plafonne a 5 annonces', async () => {
    const now = new Date('2026-03-10T12:00:00Z');
    for (let i = 1; i <= 8; i += 1) {
      await fakeListingModel.create({
        title: `Annonce ${i}`,
        slug: `annonce-${i}`,
        price: 10_000 + i,
        currency: 'XOF',
        game: { name: 'eFootball', slug: 'efootball' },
        country: 'SN',
        views: i * 100,
        status: 'PUBLISHED',
        createdAt: now,
      });
    }

    const result = await NewsletterService.selectListings(now);
    expect(result).toHaveLength(5);
    expect(result.map((l) => l.views)).toEqual([800, 700, 600, 500, 400]);
  });

  it('exclut les identifiants deja mis en avant', async () => {
    const now = new Date('2026-03-10T12:00:00Z');
    const star = await fakeListingModel.create({
      title: 'Deja presentee',
      slug: 'deja',
      price: 10_000,
      currency: 'XOF',
      game: { name: 'eFootball', slug: 'efootball' },
      country: 'SN',
      views: 999,
      status: 'PUBLISHED',
      createdAt: now,
    });

    const result = await NewsletterService.selectListings(now, [star._id]);
    expect(result.map((l) => l.title)).not.toContain('Deja presentee');
  });

  it('renvoie le slug du jeu, necessaire au lien de l\'annonce', async () => {
    const now = new Date('2026-03-10T12:00:00Z');
    await fakeListingModel.create({
      title: 'Avec jeu',
      slug: 'avec-jeu',
      price: 10_000,
      currency: 'XOF',
      game: { name: 'eFootball', slug: 'efootball' },
      country: 'SN',
      views: 100,
      status: 'PUBLISHED',
      createdAt: now,
    });

    const [listing] = await NewsletterService.selectListings(now);
    expect(listing.gameSlug).toBe('efootball');
    expect(listing.gameName).toBe('eFootball');
  });
});

describe('MarketingConsentService', () => {
  it('genere un jeton a l\'opt-in', async () => {
    const user = await seedOptedInUser();
    const stored = fakeUserModel.__store.get(user._id);
    const marketing = stored?.marketing as { optedIn: boolean; unsubscribeToken: string };
    expect(marketing.optedIn).toBe(true);
    expect(marketing.unsubscribeToken).toMatch(/^[a-f0-9]{64}$/);
  });

  it('desinscrit par jeton et journalise la date', async () => {
    const user = await seedOptedInUser('desabonner@test.sn');

    const found = await MarketingConsentService.unsubscribeByToken(hex64);

    expect(found).toBe(true);
    const stored = fakeUserModel.__store.get(user._id);
    const marketing = stored?.marketing as { optedIn: boolean; updatedAt: Date | null };
    expect(marketing.optedIn).toBe(false);
    expect(marketing.updatedAt).toBeInstanceOf(Date);
  });

  it('ignore un jeton inconnu sans lever', async () => {
    await expect(MarketingConsentService.unsubscribeByToken('b'.repeat(64))).resolves.toBe(false);
  });

  it('ne liste que les consentants verifies et actifs', async () => {
    await seedOptedInUser('ok@test.sn');
    await fakeUserModel.create({
      email: 'non-verifie@test.sn',
      firstName: 'B',
      emailVerified: false,
      status: 'ACTIVE',
      marketing: { optedIn: true, unsubscribeToken: hex64 },
    });
    await fakeUserModel.create({
      email: 'suspendu@test.sn',
      firstName: 'C',
      emailVerified: true,
      status: 'SUSPENDED',
      marketing: { optedIn: true, unsubscribeToken: hex64 },
    });
    await fakeUserModel.create({
      email: 'desinscrit@test.sn',
      firstName: 'D',
      emailVerified: true,
      status: 'ACTIVE',
      marketing: { optedIn: false, unsubscribeToken: hex64 },
    });

    const recipients = await MarketingConsentService.listRecipients();
    expect(recipients.map((r) => r.email)).toEqual(['ok@test.sn']);
  });
});

describe('NewsletterService.sendCampaign', () => {
  /**
   * Toutes les dates de ce bloc sont relatives à maintenant et non fixées au
   * calendrier : la détection de campagne orpheline compare `updatedAt` à
   * l'horloge réelle, et une date figée finirait un jour par être située hors
   * de la fenêtre de 30 minutes — le test échouerait alors pour une raison
   * étrangère à ce qu'il vérifie.
   */
  it('envoie une campagne et la marque COMPLETED', async () => {
    const now = new Date();
    await seedOneListing(now);
    await seedOptedInUser();

    const result = await NewsletterService.sendCampaign({ initiatedBy: 'cron:test', now, skipScheduleCheck: true });

    expect(result.alreadySent).toBe(false);
    expect(result.successCount).toBe(1);
    expect(result.failureCount).toBe(0);
    expect(sendWeeklyTopListings).toHaveBeenCalledTimes(1);

    const campaign = [...fakeCampaignModel.__store.values()][0];
    expect(campaign?.status).toBe('COMPLETED');
  });

  it('n\'envoie pas une seconde fois sur la meme periode', async () => {
    const now = new Date();
    await seedOneListing(now);
    await seedOptedInUser();

    await NewsletterService.sendCampaign({ initiatedBy: 'cron:test', now, skipScheduleCheck: true });
    const second = await NewsletterService.sendCampaign({ initiatedBy: 'cron:test', now, skipScheduleCheck: true });

    expect(second.alreadySent).toBe(true);
    expect(sendWeeklyTopListings).toHaveBeenCalledTimes(1);
  });

  it('n\'ecrit aucune campagne quand il n\'y a rien a envoyer', async () => {
    const now = new Date();
    await seedOneListing(now);
    // Aucun destinataire : consommer la cle ici condamnerait la journee.
    const result = await NewsletterService.sendCampaign({ initiatedBy: 'cron:test', now, skipScheduleCheck: true });

    expect(result.recipientCount).toBe(0);
    expect(fakeCampaignModel.__store.size).toBe(0);
  });

  it('isole un destinataire en erreur et marque PARTIAL', async () => {
    const now = new Date();
    await seedOneListing(now);
    await seedOptedInUser('a@test.sn');
    await seedOptedInUser('b@test.sn');

    sendWeeklyTopListings.mockImplementationOnce(async () => {
      throw new Error('adresse invalide');
    });

    const result = await NewsletterService.sendCampaign({ initiatedBy: 'cron:test', now, skipScheduleCheck: true });

    expect(result.successCount).toBe(1);
    expect(result.failureCount).toBe(1);
    const campaign = [...fakeCampaignModel.__store.values()][0];
    expect(campaign?.status).toBe('PARTIAL');
  });

  it('relance une campagne restee RUNNING apres un crash', async () => {
    const now = new Date();
    await seedOneListing(now);
    await seedOptedInUser();

    // Campagne orpheline : créée il y a une heure, donc au-delà des 30 minutes
    // qui font considérer un envoi comme encore en cours.
    await fakeCampaignModel.create({
      key: NewsletterService.campaignKey(now),
      periodStart: now,
      periodEnd: now,
      listingIds: [],
      status: 'RUNNING',
      recipientCount: 1,
      successCount: 0,
      failureCount: 0,
      initiatedBy: 'cron:test',
      createdAt: new Date(now.getTime() - 60 * 60 * 1000),
      updatedAt: new Date(now.getTime() - 60 * 60 * 1000),
    });

    const result = await NewsletterService.sendCampaign({ initiatedBy: 'cron:test', now, skipScheduleCheck: true });

    expect(result.alreadySent).toBe(false);
    expect(sendWeeklyTopListings).toHaveBeenCalledTimes(1);
  });

  it('ne relance pas une campagne RUNNING encore recente', async () => {
    const now = new Date();
    await seedOneListing(now);
    await seedOptedInUser();

    await fakeCampaignModel.create({
      key: NewsletterService.campaignKey(now),
      periodStart: now,
      periodEnd: now,
      listingIds: [],
      status: 'RUNNING',
      recipientCount: 1,
      successCount: 0,
      failureCount: 0,
      initiatedBy: 'cron:test',
      createdAt: now,
      updatedAt: now,
    });

    const result = await NewsletterService.sendCampaign({ initiatedBy: 'cron:test', now, skipScheduleCheck: true });

    expect(result.alreadySent).toBe(true);
    expect(sendWeeklyTopListings).not.toHaveBeenCalled();
  });
});

describe('NewsletterService — planification (NEWSLETTER_DAYS)', () => {
  /**
   * Une date dont le jour ISO est garanti absent de la configuration.
   *
   * `NEWSLETTER_DAYS` vaut `2` (mardi) par défaut. Comme le test tourne un
   * jour quelconque, il cherche dynamiquement un jour non programmé plutôt que
   * d'écrire une date fixe : sinon le test passerait un mardi et échouerait le
   * reste de la semaine.
   */
  function aDateOutsideSchedule(): Date {
    for (let i = 0; i < 7; i += 1) {
      const d = new Date();
      d.setUTCDate(d.getUTCDate() + i);
      if (!NewsletterService.isSendDay(d)) return d;
    }
    throw new Error('Aucun jour hors planification trouvé : NEWSLETTER_DAYS couvre 7 jours');
  }

  it('ignore un appel sur un jour non programmé', async () => {
    const now = aDateOutsideSchedule();
    await seedOneListing(now);
    await seedOptedInUser();

    const result = await NewsletterService.sendCampaign({ initiatedBy: 'cron:test', now });

    expect(result.recipientCount).toBe(0);
    expect(sendWeeklyTopListings).not.toHaveBeenCalled();
  });

  it('ne consomme pas la clé du jour sur un jour non programmé', async () => {
    const now = aDateOutsideSchedule();
    await seedOneListing(now);
    await seedOptedInUser();

    await NewsletterService.sendCampaign({ initiatedBy: 'cron:test', now });

    // Point critique : la clé est journalière, et un « envoi vide » la
    // consommerait définitivement. Le vrai jour de la semaine, l'envoi doit
    // donc encore partir.
    expect(fakeCampaignModel.__store.size).toBe(0);
  });

  it('laisse partir le premier appel du jour programmé', async () => {
    const now = new Date();
    // On se place sur un jour effectivement programmé.
    for (let i = 0; i < 7; i += 1) {
      const d = new Date();
      d.setUTCDate(d.getUTCDate() + i);
      if (NewsletterService.isSendDay(d)) {
        await seedOneListing(d);
        await seedOptedInUser();
        const result = await NewsletterService.sendCampaign({ initiatedBy: 'cron:test', now: d });
        expect(result.successCount).toBe(1);
        return;
      }
    }
    throw new Error('Aucun jour programmé trouvé : NEWSLETTER_DAYS est vide');
  });

  it('ignore tous les appels suivants du meme jour programme', async () => {
    const now = new Date();
    for (let i = 0; i < 7; i += 1) {
      const d = new Date();
      d.setUTCDate(d.getUTCDate() + i);
      if (!NewsletterService.isSendDay(d)) continue;
      await seedOneListing(d);
      await seedOptedInUser();

      await NewsletterService.sendCampaign({ initiatedBy: 'cron:test', now: d });
      sendWeeklyTopListings.mockClear();
      // Le cron sonne toutes les 4 minutes : ce qui suit doit être ignoré.
      const second = await NewsletterService.sendCampaign({ initiatedBy: 'cron:test', now: d });
      const third = await NewsletterService.sendCampaign({ initiatedBy: 'cron:test', now: d });

      expect(second.alreadySent).toBe(true);
      expect(third.alreadySent).toBe(true);
      expect(sendWeeklyTopListings).not.toHaveBeenCalled();
      return;
    }
    throw new Error('Aucun jour programmé trouvé : NEWSLETTER_DAYS est vide');
  });

  it('connait le jour ISO de la date', () => {
    // 2026-03-09 est un lundi, 2026-03-15 un dimanche.
    expect(NewsletterService.isoWeekday(new Date('2026-03-09T12:00:00Z'))).toBe(1);
    expect(NewsletterService.isoWeekday(new Date('2026-03-15T12:00:00Z'))).toBe(7);
  });
});

describe('NewsletterService.recentlyFeaturedListingIds', () => {
  it('exclut aussi les annonces des campagnes partielles', async () => {
    // Fenêtre d'exclusion de 14 jours : les campagnes doivent être récentes,
    // donc datées autour de maintenant et non à une date fixe du calendrier.
    const now = new Date();
    const complete = await fakeCampaignModel.create({
      key: '2026-W11-2',
      periodStart: now,
      periodEnd: now,
      listingIds: ['aaa'],
      status: 'COMPLETED',
      recipientCount: 10,
      successCount: 10,
      failureCount: 0,
      initiatedBy: 'cron:test',
    });
    const partial = await fakeCampaignModel.create({
      key: '2026-W11-4',
      periodStart: now,
      periodEnd: now,
      listingIds: ['bbb'],
      status: 'PARTIAL',
      recipientCount: 10,
      successCount: 6,
      failureCount: 4,
      initiatedBy: 'cron:test',
    });
    const failed = await fakeCampaignModel.create({
      key: '2026-W11-5',
      periodStart: now,
      periodEnd: now,
      listingIds: ['ccc'],
      status: 'FAILED',
      recipientCount: 10,
      successCount: 0,
      failureCount: 10,
      initiatedBy: 'cron:test',
    });

    const ids = await NewsletterService.recentlyFeaturedListingIds();

    expect(ids).toContain('aaa');
    // Une campagne PARTIAL a bien distribué une partie des annonces.
    expect(ids).toContain('bbb');
    // Une campagne FAILED n'a rien distribué : la republier est correct.
    expect(ids).not.toContain('ccc');
    expect(complete).toBeDefined();
    expect(partial).toBeDefined();
    expect(failed).toBeDefined();
  });
});
