import crypto from 'node:crypto';
import { UserModel } from '../users/user.model.js';
import { logger } from '../../lib/logger.js';

/**
 * Consentement aux emails commerciaux (newsletter).
 *
 * Point d'entrée unique du couple opt-in / désinscription : l'inscription
 * (avec ou sans case cochee), la page preferences, le formulaire du footer et
 * la route publique de desinscription passent tous par ici. C'est ce qui evite
 * qu'un autre chemin n'implemente le token a sa facon et ne le regenere pas.
 *
 * Regle de conception : le token n'existe que si la personne a consenti. Inutile
 * d'en generer un a la creation du compte, le champ resterait non nul pour tout
 * le monde et un index sparse perdrait son interet.
 */
export function buildOptInState(optedIn: boolean): {
  optedIn: boolean;
  updatedAt: Date;
  unsubscribeToken: string | null;
} {
  return {
    optedIn,
    updatedAt: new Date(),
    // 32 octets aleatoires en hex : 64 caracteres, guessing impossible, et
    // assez court pour tenir dans une URL d'email sans la rendre illisible.
    unsubscribeToken: optedIn ? crypto.randomBytes(32).toString('hex') : null,
  };
}

export class MarketingConsentService {
  /**
   * Bascule l'opt-in d'un utilisateur et journalise le choix.
   *
   * Lors d'une desinscription, le token est retire avec `$unset` plutot que
   * mis a `null` : aucun chainon residuel, et un ancien lien d'email renvoie
   * alors "token inconnu" au lieu de paraitre valide.
   *
   * Le token est regenere a chaque passage a `true` : un lien de desinscription
   * envoye il y a six mois ne peut ainsi pas decider de l'etat actuel d'un
   * compte qui s'est reabonne depuis.
   */
  static async setOptIn(
    userId: string,
    optedIn: boolean,
    source: 'profile' | 'register' | 'footer' | 'one_click' | 'page' = 'profile',
  ): Promise<{ unsubscribeToken: string | null }> {
    const state = buildOptInState(optedIn);

    await UserModel.updateOne(
      { _id: userId },
      optedIn
        ? {
            $set: {
              'marketing.optedIn': true,
              'marketing.updatedAt': state.updatedAt,
              'marketing.unsubscribeToken': state.unsubscribeToken,
            },
          }
        : {
            $set: { 'marketing.optedIn': false, 'marketing.updatedAt': state.updatedAt },
            $unset: { 'marketing.unsubscribeToken': 1 },
          },
    );

    logger.info(
      { userId, optedIn, source },
      optedIn ? 'Opt-in newsletter' : 'Desinscription newsletter',
    );

    return { unsubscribeToken: state.unsubscribeToken };
  }

  /**
   * Desinscription a partir du token contenu dans l'email (RFC 8058).
   *
   * Ne renvoie `true` que si une ligne a reellement change. La route appelante
   * repond dans tous les cas 200 : un code de retour distinct permettrait
   * d'enumerer les tokens valides, et comme l'adresse ne transite que dans
   * l'URL du lien, rien n'oblige a distinguer "inconnu" de "deja desinscrit".
   *
   * Idempotent, et le filtre `optedIn: true` evite de reecrire la date de
   * consentement d'un compte deja desinscrit.
   */
  static async unsubscribeByToken(token: string): Promise<boolean> {
    const result = await UserModel.updateOne(
      { 'marketing.unsubscribeToken': token, 'marketing.optedIn': true },
      {
        $set: { 'marketing.optedIn': false, 'marketing.updatedAt': new Date() },
        $unset: { 'marketing.unsubscribeToken': 1 },
      },
    );

    if (result.modifiedCount > 0) {
      logger.info({ count: result.modifiedCount }, 'Desinscription newsletter par lien email');
      return true;
    }
    return false;
  }

  /**
   * Destinataires legitimes d'un envoi de newsletter.
   *
   * Les quatre filtres ne sont pas redondants : chacun elimine une famille de
   * risque distincte.
   *  - `optedIn`       : pas de consentement, pas d'envoi. C'est le principe.
   *  - `emailVerified` : envoyer a une adresse non verifiee est un signal
   *                      d'envoi massif non sollicite, et un rebond quasi
   *                      garanti pour une adresse saisie de travers.
   *  - `status ACTIVE` : un compte banni ou suspendu ne doit plus recevoir de
   *                      sollicitations, y compris commerciales.
   *  - token non nul   : ne pas envoyer a quelqu'un dont l'email ne contient
   *                      aucun lien de desinscription, ce qui serait le
   *                      contre-sens juridique du lot.
   *
   * Projection minimale : seuls les champs necessaires a l'envoi. Le token est
   * `select: false` sur le schema, il faut donc le demander explicitement.
   */
  static async listRecipients(): Promise<
    Array<{ _id: string; email: string; firstName: string; unsubscribeToken: string }>
  > {
    const users = await UserModel.find({
      'marketing.optedIn': true,
      'marketing.unsubscribeToken': { $ne: null },
      emailVerified: true,
      status: 'ACTIVE',
    })
      .select('+marketing.unsubscribeToken email firstName')
      .lean();

    return users.map((u) => ({
      _id: String(u._id),
      email: u.email,
      firstName: u.firstName,
      unsubscribeToken: u.marketing?.unsubscribeToken ?? '',
    }));
  }

  /**
   * Relit le token d'un utilisateur a la demande.
   *
   * Isole ici parce que c'est le seul endroit, hors du lien contenu dans
   * l'email, ou le token est lu en clair. Reserve a l'admin qui doit verifier
   * qu'un lien de desinscription fonctionne reellement.
   */
  static async peekUnsubscribeToken(userId: string): Promise<string | null> {
    const user = await UserModel.findById(userId).select('+marketing.unsubscribeToken');
    return user?.marketing?.unsubscribeToken ?? null;
  }
}
