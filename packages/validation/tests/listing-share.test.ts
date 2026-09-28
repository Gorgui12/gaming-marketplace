import { describe, it, expect } from 'vitest';
import { shareListingSchema } from '../src/listing.schema.js';

/**
 * La validation du partage est une frontiere de confiance : le corps de la
 * requete vient d'un navigateur, sur une route publique, et alimente un
 * compteur affiche au vendeur. Ces tests verrouillent le refus de ce qui
 * n'est pas un partage legitime, en particulier l'identifiant de session —
 * c'est lui qui porte la deduplication, donc une valeur libre ferait que
 * n'importe qui gonflerait le compteur a la demande.
 */
describe('shareListingSchema', () => {
  it('accepte un partage WhatsApp avec un identifiant de session', () => {
    const parsed = shareListingSchema.parse({
      channel: 'whatsapp',
      sessionId: '3f8a1c2e-4b7d-4a1f-9c3e-2d5b6a7c8e90',
    });
    expect(parsed.channel).toBe('whatsapp');
  });

  it('accepte les quatre canaux de la plateforme', () => {
    for (const channel of ['whatsapp', 'facebook', 'native', 'copy']) {
      expect(shareListingSchema.parse({ channel, sessionId: 'session-1' }).channel).toBe(channel);
    }
  });

  it('refuse un canal inconnu', () => {
    // Un canal non prevu au modele serait accepte par l'index unique mais
    // fausserait la lecture des sources de partage.
    expect(() => shareListingSchema.parse({ channel: 'telegram', sessionId: 'session-1' })).toThrow();
  });

  it('refuse un canal absent', () => {
    expect(() => shareListingSchema.parse({ sessionId: 'session-1' })).toThrow();
  });

  it('refuse un identifiant de session absent', () => {
    expect(() => shareListingSchema.parse({ channel: 'whatsapp' })).toThrow();
  });

  it('refuse un identifiant de session trop court pour etre un identifiant', () => {
    expect(() => shareListingSchema.parse({ channel: 'whatsapp', sessionId: 'abc' })).toThrow();
  });

  it('refuse un identifiant de session anormalement long', () => {
    // La valeur est stockee en base : sans plafond, un appelant ferait ecrire
    // des chaines arbitrairement longues dans la collection de journalisation.
    expect(() =>
      shareListingSchema.parse({ channel: 'whatsapp', sessionId: 'a'.repeat(65) }),
    ).toThrow();
  });

  it('ignore les champs non declares plutot que de les refuser', () => {
    // Le front peut evoluer sans casser les anciens clients ; les champs
    // parasites ne doivent pas devenir un vecteur d'erreur.
    const parsed = shareListingSchema.parse({
      channel: 'copy',
      sessionId: 'session-1',
      force: true,
      shareCount: 9999,
    });
    expect(parsed).toEqual({ channel: 'copy', sessionId: 'session-1' });
  });
});
