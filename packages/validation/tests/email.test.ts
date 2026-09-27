import { describe, it, expect } from 'vitest';
import {
  analyseEmail,
  emailFieldSchema,
  levenshtein,
  EMAIL_MAX_LENGTH,
} from '../src/email.js';

/**
 * Ces tests verrouillent deux propriétés qui ne doivent JAMAIS régresser :
 *
 *  1. AUCUN faux positif sur une adresse légitime. Une liste de blocage trop
 *     large prendrait des clients réels avec le reste. On ne refuse que ce
 *     qui est objectivement inutilisable.
 *  2. AUCUN Typos de suggestion qui n'est pas une simple proposition. Une
 *     adresse mal orthographiée reste acceptée : bloquer sur une heuristique
 *     priverait quelqu'un de son compte parce qu'il s'appelle « Beye ».
 */
describe('analyseEmail — refus', () => {
  it('refuse une adresse sans @', () => {
    expect(analyseEmail('pas-un-email').problem).toBeTruthy();
  });

  it('refuse une adresse sans partie locale', () => {
    expect(analyseEmail('@gmail.com').problem).toBeTruthy();
  });

  it('refuse une adresse sans domaine', () => {
    expect(analyseEmail('joueur@').problem).toBeTruthy();
  });

  it('refuse les points consécutifs et en bord de partie locale', () => {
    expect(analyseEmail('jou..eur@gmail.com').problem).toBeTruthy();
    expect(analyseEmail('.joueur@gmail.com').problem).toBeTruthy();
    expect(analyseEmail('joueur.@gmail.com').problem).toBeTruthy();
  });

  it('refuse un TLD trop court', () => {
    expect(analyseEmail('joueur@example.c').problem).toBeTruthy();
  });

  it('refuse un TLD avec chiffre', () => {
    expect(analyseEmail('joueur@example.c0m').problem).toBeTruthy();
  });

  it('refuse un domaine sans point', () => {
    expect(analyseEmail('joueur@localhost').problem).toBeTruthy();
  });

  it('refuse les TLD réservés', () => {
    // Aucun domaine public ne peut porter ces TLD : le compte serait
    // automatiquement bloqué.
    for (const tld of ['test', 'invalid', 'example', 'localhost']) {
      expect(analyseEmail(`joueur@domaine.${tld}`).problem).toBeTruthy();
    }
  });

  it('refuse un domaine jetable connu', () => {
    const res = analyseEmail('joueur@mailinator.com');
    expect(res.problem).toContain('jetable');
    expect(res.suggestion).toBeNull();
  });

  it('refuse une adresse trop longue', () => {
    const long = `${'a'.repeat(EMAIL_MAX_LENGTH)}@gmail.com`;
    expect(analyseEmail(long).problem).toBeTruthy();
  });

  it('accepte une adresse légitime et ne suggère rien', () => {
    const res = analyseEmail('awa.diop@gmail.com');
    expect(res.problem).toBeNull();
    expect(res.suggestion).toBeNull();
  });

  it('accepte les domaines d\'entreprise et les domaines régionaux', () => {
    // Faux positifs interdits : un TLD court est un pays, pas une faute.
    for (const email of [
      'contact@boutique-exemple.sn',
      'info@societe.co',
      'vendeur@shop.com.br',
      'a.b@sub.domaine.fr',
      'joueur+tag@orange.fr',
    ]) {
      expect(analyseEmail(email).problem).toBeNull();
    }
  });

  it('n\'impose jamais de suggestion sur un domaine d\'entreprise proche', () => {
    // « gmaill.com » ressemble à gmail, mais « monentreprise.com » non : le
    // filtrage par longueur de domaine évite de suggérer n'importe quoi.
    const res = analyseEmail('contact@maison- decoration.com'.replace(' ', ''));
    expect(res.suggestion).toBeNull();
  });
});

describe('analyseEmail — suggestions', () => {
  it('corrige une faute de frappe dans le TLD', () => {
    expect(analyseEmail('joueur@gmail.con').suggestion).toBe('joueur@gmail.com');
    expect(analyseEmail('joueur@gmail.cmo').suggestion).toBe('joueur@gmail.com');
  });

  it('corrige une transposition dans le domaine', () => {
    expect(analyseEmail('joueur@gmial.com').suggestion).toBe('joueur@gmail.com');
    expect(analyseEmail('joueur@hotmial.com').suggestion).toBe('joueur@hotmail.com');
  });

  it('ne bloque PAS une adresse mal orthographiée', () => {
    // Point essentiel : la faute de frappe est un indice, jamais un refus.
    // L'utilisateur reste maître de son adresse.
    expect(analyseEmail('joueur@gmial.com').problem).toBeNull();
  });

  it('ne suggère rien quand le domaine est déjà exact', () => {
    expect(analyseEmail('joueur@yahoo.fr').suggestion).toBeNull();
  });

  it('ne propose rien au-delà de la fenêtre de faute', () => {
    // Trop loin d'un fournisseur : ce serait du bruit.
    expect(analyseEmail('joueur@completely-different-domain.org').suggestion).toBeNull();
  });
});

describe('levenshtein', () => {
  it('vaut 0 pour deux chaînes identiques', () => {
    expect(levenshtein('gmail.com', 'gmail.com')).toBe(0);
  });

  it('compte une substitution', () => {
    expect(levenshtein('gmail.com', 'gmial.com')).toBe(2); // transposition = 2 opérations
  });

  it('compte un ajout', () => {
    expect(levenshtein('gmail.com', 'gmaill.com')).toBe(1);
  });

  it('gère la chaîne vide', () => {
    expect(levenshtein('', 'abc')).toBe(3);
    expect(levenshtein('abc', '')).toBe(3);
  });
});

describe('emailFieldSchema', () => {
  it('accepte une adresse valide', () => {
    expect(emailFieldSchema.safeParse('awa@gmail.com').success).toBe(true);
  });

  it('rognent les espaces', () => {
    const res = emailFieldSchema.safeParse('  awa@gmail.com  ');
    expect(res.success).toBe(true);
    if (res.success) expect(res.data).toBe('awa@gmail.com');
  });

  it('renvoie le motif précis du refus, pas un message générique', () => {
    const res = emailFieldSchema.safeParse('joueur@mailinator.com');
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.issues[0]?.message).toContain('jetable');
    }
  });
});
