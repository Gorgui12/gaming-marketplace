import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createFakeModel } from './helpers/fake-model.js';

const fakeListingModel = createFakeModel();
const fakeShareModel = createFakeModel();
const fakeGameModel = createFakeModel();

vi.mock('../src/modules/listings/listing.model.js', () => ({ ListingModel: fakeListingModel }));
vi.mock('../src/modules/listings/listing-share.model.js', () => ({
  ListingShareModel: fakeShareModel,
}));
vi.mock('../src/modules/games/game.model.js', () => ({ GameModel: fakeGameModel }));

const { ListingsService } = await import('../src/modules/listings/listings.service.js');

async function seedPublishedListing(slug = 'ma-formation', shareCount = 0) {
  return fakeListingModel.create({
    title: 'Compte eFootball 95',
    slug,
    price: 25_000,
    currency: 'XOF',
    status: 'PUBLISHED',
    moderationStatus: 'APPROVED',
    views: 120,
    shareCount,
  });
}

/** Reproduit le rejet de l'index unique `(listing, sessionId)`. */
function simulateDuplicateKey() {
  return { code: 11000, message: 'E11000 duplicate key error' };
}

beforeEach(() => {
  fakeListingModel.__reset();
  fakeShareModel.__reset();
  fakeGameModel.__reset();
});

describe('ListingsService.registerShare', () => {
  it('incremente le compteur au premier partage d\'une session', async () => {
    const listing = await seedPublishedListing();

    const result = await ListingsService.registerShare('ma-formation', {
      sessionId: 'session-a',
      channel: 'whatsapp',
    });

    expect(result).toEqual({ counted: true, shareCount: 1 });
    const after = await fakeListingModel.findById(listing._id);
    expect(after?.shareCount).toBe(1);
  });

  it('ne recompte pas un second partage de la meme session', async () => {
    const listing = await seedPublishedListing();
    await ListingsService.registerShare('ma-formation', { sessionId: 'session-a', channel: 'whatsapp' });
    // Deuxieme partage : l'insertion viole l'index unique.
    vi.spyOn(fakeShareModel, 'create').mockRejectedValueOnce(simulateDuplicateKey());

    const result = await ListingsService.registerShare('ma-formation', {
      sessionId: 'session-a',
      channel: 'copy',
    });

    expect(result.counted).toBe(false);
    const after = await fakeListingModel.findById(listing._id);
    // Le total reste a 1 : c'est tout l'interet de la deduplication.
    expect(after?.shareCount).toBe(1);
  });

  it('compte une session differente comme un nouveau partage', async () => {
    const listing = await seedPublishedListing();
    await ListingsService.registerShare('ma-formation', { sessionId: 'session-a', channel: 'whatsapp' });

    const result = await ListingsService.registerShare('ma-formation', {
      sessionId: 'session-b',
      channel: 'native',
    });

    expect(result).toEqual({ counted: true, shareCount: 2 });
    const after = await fakeListingModel.findById(listing._id);
    expect(after?.shareCount).toBe(2);
  });

  it('part d\'un compteur existant deja non nul', async () => {
    await seedPublishedListing('ma-formation', 7);

    const result = await ListingsService.registerShare('ma-formation', {
      sessionId: 'session-a',
      channel: 'whatsapp',
    });

    expect(result).toEqual({ counted: true, shareCount: 8 });
  });

  it('journalise la session, le canal et l\'utilisateur connecte', async () => {
    await seedPublishedListing();

    await ListingsService.registerShare('ma-formation', {
      sessionId: 'session-a',
      channel: 'facebook',
      userId: 'user-1',
    });

    const logged = [...fakeShareModel.__store.values()][0]!;
    expect(logged.sessionId).toBe('session-a');
    expect(logged.channel).toBe('facebook');
    expect(logged.user).toBe('user-1');
    // La date d'expiration pilote l'index TTL et doit donc etre posee.
    expect(logged.expiresAt).toBeInstanceOf(Date);
  });

  it('refuse une annonce qui n\'est pas publiee', async () => {
    await fakeListingModel.create({
      title: 'Brouillon',
      slug: 'brouillon',
      status: 'DRAFT',
      shareCount: 0,
    });

    await expect(
      ListingsService.registerShare('brouillon', { sessionId: 'session-a', channel: 'whatsapp' }),
    ).rejects.toMatchObject({ code: 'LISTING_NOT_FOUND' });
  });

  it('refuse un slug inconnu', async () => {
    await expect(
      ListingsService.registerShare('inexistant', { sessionId: 'session-a', channel: 'whatsapp' }),
    ).rejects.toMatchObject({ code: 'LISTING_NOT_FOUND' });
  });

  it('ne confond pas une panne de base avec un doublon', async () => {
    await seedPublishedListing();
    // Une erreur Mongo quelconque (serveur indisponible, quota) ne doit pas
    // etre traduite en "deja partage" : sinon le compteur resterait bloque
    // silencieusement et le vendeur perdrait ses partages.
    vi.spyOn(fakeShareModel, 'create').mockRejectedValueOnce(
      Object.assign(new Error('connection timed out'), { code: 189 }),
    );

    await expect(
      ListingsService.registerShare('ma-formation', { sessionId: 'session-a', channel: 'whatsapp' }),
    ).rejects.toThrow('connection timed out');
  });

  it('n\'incremente pas le compteur si l\'insertion du journal echoue', async () => {
    const listing = await seedPublishedListing();
    vi.spyOn(fakeShareModel, 'create').mockRejectedValueOnce(
      Object.assign(new Error('boom'), { code: 189 }),
    );

    await expect(
      ListingsService.registerShare('ma-formation', { sessionId: 'session-a', channel: 'whatsapp' }),
    ).rejects.toThrow();
    const after = await fakeListingModel.findById(listing._id);
    expect(after?.shareCount).toBe(0);
  });

  it('ne touche pas au compteur de vues', async () => {
    const listing = await seedPublishedListing();

    await ListingsService.registerShare('ma-formation', { sessionId: 'session-a', channel: 'whatsapp' });

    const after = await fakeListingModel.findById(listing._id);
    // Un partage est une intention, pas une visite de la page.
    expect(after?.views).toBe(120);
  });
});
