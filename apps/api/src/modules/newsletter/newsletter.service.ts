import { Types } from 'mongoose';
import { ListingStatus } from '@gm/types';
import { ListingModel } from '../listings/listing.model.js';
import { EmailService } from '../../lib/email/email.service.js';
import { AuditService } from '../audit/audit.service.js';
import { logger } from '../../lib/logger.js';
import { env, newsletterDays } from '../../config/env.js';
import { NewsletterCampaignModel } from './newsletter-campaign.model.js';
import { MarketingConsentService } from './marketing-consent.service.js';

/** Nombre d'annonces mises en avant par la newsletter. */
const NEWSLETTER_LISTING_COUNT = 5;

/**
 * Fenetre de fraicheur de la selection.
 *
 * Configurable via NEWSLETTER_WINDOW_DAYS, et volontairement plus courte que
 * la semaine ISO qui sert a la cle de campagne : avec deux envois par semaine,
 * une fenetre de 7 jours ferait apparaitre en moyenne chaque annonce dans les
 * deux emails de la meme semaine. Une fenetre courte laisse au contraire un
 * angle mort entre les deux envois, ce qui rend la repetition peu probable
 * meme sans l'exclusion par historique.
 */
const FRESHNESS_WINDOW_DAYS = env.NEWSLETTER_WINDOW_DAYS;

/**
 * Duree pendant laquelle une annonce deja presentee est exclue de la
 * selection. Couvre deux cycles d'envoi : meme si l'historique de campagne est
 * incomplet, un destinataire ne recoit pas la meme annonce en boucle.
 */
const ALREADY_FEATURED_DAYS = 14;

/** Envois en parallele. */
const SEND_CONCURRENCY = 5;

/**
 * Duree au-dela de laquelle une campagne `RUNNING` est consideree comme
 * orpheline et peut etre relancee. Couvre largement le temps d'envoi d'une
 * liste entiere, tout en bornant la fenetre ou le meme contenu pourrait partir
 * deux fois.
 */
const STALE_RUNNING_MS = 30 * 60 * 1000;

export type NewsletterListing = {
  id: string;
  title: string;
  slug: string;
  price: string;
  currency: string;
  gameName: string;
  /** Slug du jeu : la route de detail est `/marketplace/{game}/{listing}`. */
  gameSlug: string;
  country: string;
  views: number;
};

/**
 * Selection des « 5 plus gros nouveaux comptes ».
 *
 * Deux arbitrages non evacues, documentes ici parce qu'ils se verraient sinon
 * comme des bugs :
 *
 * 1. Le filtre est `status: PUBLISHED` seul, exactement comme
 *    `ListingsService.search`. Le classement du marketing et le catalogue
 *    visible doivent montrer le meme ensemble : une annonce que la newsletter
 *    met en avant alors qu'elle n'apparait pas sur la marketplace serait
 *    directement percue comme trompeuse.
 *
 * 2. Le tri est sur `views`, qui est gonflable : `ListingsService.getBySlug`
 *    incremente de 1 a chaque affichage, sans session ni deduplication, donc
 *    un vendeur peut recharger sa propre page. D'ou le plancher
 *    `NEWSLETTER_MIN_VIEWS` : il n'empeche pas la triche, mais il la rend
 *    peu rentable, parce qu'il faut generer autant de visites que le seuil
 *    l'exige pour une seule place dans le classement. Sans seuil, une annonce
 *    fraichement publiee avec 8 vues passerait devant une annonce qui a fait
 *    300 visites la semaine derniere — ce qui n'est pas « les plus gros », c'est
 *    « les plus rapides ».
 */
export class NewsletterService {
  /** Jour ISO de la date : 1 = lundi … 7 = dimanche. */
  static isoWeekday(date: Date): number {
    return (date.getUTCDay() + 6) % 7 + 1;
  }

  /**
   * La newsletter doit-elle partir à cette date ?
   *
   * Décision prise ici plutôt que dans cron-job.org, qui ne propose pas de
   * sélecteur de jour de la semaine dans son offre gratuite : la cadence
   * devient une variable d'environnement, donc modifiable sans toucher au code
   * et surtout testable.
   */
  static isSendDay(date: Date = new Date()): boolean {
    return newsletterDays.includes(NewsletterService.isoWeekday(date));
  }

  /** Identifiant de periode : semaine ISO + jour ISO (1 = lundi, 7 = dimanche). */
  static campaignKey(date: Date = new Date()): string {
    // Semaine ISO 8601. `getISOWeek` n'est pas dispo sur toutes les cibles
    // ciblees, donc le calcul est fait a la main plutot que d'ajouter une
    // dependance pour cinq lignes.
    const target = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
    // Jeudi de la semaine courante : la semaine ISO est nommee par son jeudi.
    const dayNumber = (target.getUTCDay() + 6) % 7; // 0 = lundi
    target.setUTCDate(target.getUTCDate() - dayNumber + 3);
    const isoYear = target.getUTCFullYear();
    const firstThursday = new Date(Date.UTC(isoYear, 0, 4));
    const week =
      1 +
      Math.round(
        ((target.getTime() - firstThursday.getTime()) / 86400000 -
          3 +
          ((firstThursday.getUTCDay() + 6) % 7)) /
          7,
      );
    const isoWeekday = NewsletterService.isoWeekday(date);
    return `${isoYear}-W${String(week).padStart(2, '0')}-${isoWeekday}`;
  }

  /**
   * Choisit les annonces a mettre en avant.
   *
   * `excludeListingIds` vient de l'historique des campagnes : c'est ce qui
   * empeche une annonce populaire de revenir dans les deux envois de la
   * semaine.
   */
  static async selectListings(
    now: Date = new Date(),
    excludeListingIds: string[] = [],
  ): Promise<NewsletterListing[]> {
    const periodStart = new Date(now.getTime() - FRESHNESS_WINDOW_DAYS * 86400000);

    const listings = await ListingModel.find({
      status: ListingStatus.PUBLISHED,
      createdAt: { $gte: periodStart },
      views: { $gte: env.NEWSLETTER_MIN_VIEWS },
      _id: { $nin: excludeListingIds },
    })
      .sort({ views: -1, createdAt: -1 })
      .limit(NEWSLETTER_LISTING_COUNT)
      .populate('game', 'name slug')
      .lean();

    return listings.map((l) => {
      const game = l.game as unknown as { name?: string; slug?: string } | undefined;
      return {
        id: String(l._id),
        title: l.title,
        slug: l.slug,
        // Le prix est formate ici et non dans le template : un montant brut
        // dans un email est illisible, et le template ne doit pas porter de
        // dependance a la devise.
        price: new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(l.price),
        currency: l.currency,
        gameName: game?.name ?? 'Jeu',
        gameSlug: game?.slug ?? '',
        country: l.country,
        views: l.views,
      };
    });
  }

  /**
   * Identifiants des annonces mises en avant recemment, a exclure.
   *
   * Publique parce que l'envoi de test de l'admin doit appliquer exactement la
   * meme exclusion que l'envoi reel : dupliquer ce calcul dans le controleur
   * garantirait qu'un jour les deux divergent, et que le test affiche un
   * contenu que personne ne recevra.
   */
  static async recentlyFeaturedListingIds(): Promise<string[]> {
    const since = new Date(Date.now() - ALREADY_FEATURED_DAYS * 86400000);
    const campaigns = await NewsletterCampaignModel.find({
      periodEnd: { $gte: since },
      // `PARTIAL` compte au meme titre que `COMPLETED`, et c'est le point
      // facile a oublier : une campagne partiellement distribuee a quand meme
      // mis en avant ses annonces devant une partie de la liste. Ne retenir
      // que les envois 100% reussis laisserait revenir en newsletter une
      // annonce que plusieurs destinataires ont recu le jour meme.
      // `FAILED` est en revanche exclu : si aucun envoi n'a abouti, aucune
      // annonce n'a ete distribuee, et la republier le jour meme est correct.
      status: { $in: ['COMPLETED', 'PARTIAL'] },
    })
      .select('listingIds')
      .lean();

    return campaigns.flatMap((c) => c.listingIds.map((id) => String(id)));
  }

  /** URL publique de desinscription d'un destinataire. */
  private static unsubscribeUrl(token: string): string {
    return `${env.API_PUBLIC_URL}/api/v1/unsubscribe/${token}`;
  }

  /**
   * Campagne deja resolue pour cette cle, ou None si l'envoi est encore
   * possible.
   *
   * Une campagne restee `RUNNING` n'est PAS un obstacle : elle correspond a un
   * processus mort en cours de route (redemarrage de l'API, timeout). La
   * traiter comme « deja envoyee » condamnerait la newsletter pour le reste de
   * la journee sur la base d'un incident ponctuel, et personne ne declencherait
   * une seconde tentative. On ne la considere donc comme bloqueante qu'apres
   * `STALE_RUNNING_MS`, ce qui laisse le temps a un envoi lent de finir tout en
   * evitant qu'un deuxieme declenchement se lance en parallele du premier.
   */
  private static async findSettledCampaign(key: string) {
    const existing = await NewsletterCampaignModel.findOne({ key }).lean();
    if (!existing) return null;
    if (existing.status === 'RUNNING') {
      const age = Date.now() - new Date(existing.updatedAt).getTime();
      if (age < STALE_RUNNING_MS) {
        // Envoi en cours il y a moins de 30 minutes : un second lancement
        // doublerait l'envoi. On le traite comme réglé, donc comme un refus
        // d'envoyer.
        return existing;
      }
      logger.error(
        { key, updatedAt: existing.updatedAt },
        'Campagne newsletter restee en RUNNING — nouvel envoi autorise',
      );
      return null;
    }
    return existing;
  }

  /**
   * Envoie la newsletter et journalise la campagne.
   *
   * `initiatedBy` est un texte libre, pas un ObjectId : le declencheur n'est
   * pas forcement un compte (c'est un cron externe) et on veut pouvoir distinguer
   * `cron:external` d'un clic admin dans l'historique.
   */
  static async sendCampaign(input: {
    initiatedBy: string;
    now?: Date;
    recipientsOverride?: Array<{
      email: string;
      firstName: string;
      unsubscribeToken: string;
    }>;
    /** Contourne la liste `NEWSLETTER_DAYS`. Réservé à l'admin et aux tests. */
    skipScheduleCheck?: boolean;
  }): Promise<{
    alreadySent: boolean;
    listingIds: string[];
    recipientCount: number;
    successCount: number;
    failureCount: number;
  }> {
    const now = input.now ?? new Date();
    const key = NewsletterService.campaignKey(now);
    const periodStart = new Date(now.getTime() - FRESHNESS_WINDOW_DAYS * 86400000);

    // Jour d'envoi, AVANT toute ecriture. Le cron externe peut sonner aussi
    // souvent qu'il veut (et c'est le cas sur cron-job.org, qui n'offre pas de
    // selecteur de jour de la semaine) : c'est ici, et non dans la
    // planification, qu'est decide si la newsletter part aujourd'hui.
    //
    // Sortir avant `findSettledCampaign` et avant toute selection n'est pas un
    // detail : la cle de campagne est journaliere, donc un envoi « vide »
    // consomme la journee. Comme c'est la seule tentative du jour, la guarde
    // laisse passer le premier appel de la matinee.
    //
    // `skipScheduleCheck` sert au controleur d'admin et aux tests, qui doivent
    // pouvoir envoyer un n'importe quel jour ; la production, elle, passe par
    // le cron et n'a pas ce droit.
    if (!input.skipScheduleCheck && !NewsletterService.isSendDay(now)) {
      logger.info(
        { isoDay: NewsletterService.isoWeekday(now), days: newsletterDays },
        "Jour sans envoi programme — appel ignore",
      );
      return {
        alreadySent: false,
        listingIds: [],
        recipientCount: 0,
        successCount: 0,
        failureCount: 0,
      };
    }

    // Idempotence AVANT toute selection : si la campagne existe deja, on sort
    // sans requeter les annonces ni les destinataires. C'est le point exact ou
    // un double declenchement du cron ferait le plus de Degats.
    const existing = await NewsletterService.findSettledCampaign(key);
    if (existing) {
      logger.info({ key, status: existing.status }, 'Newsletter deja envoyee pour cette periode — envoi ignore');
      return {
        alreadySent: true,
        listingIds: existing.listingIds.map((id) => String(id)),
        recipientCount: existing.recipientCount,
        successCount: existing.successCount,
        failureCount: existing.failureCount,
      };
    }

    const excluded = await NewsletterService.recentlyFeaturedListingIds();
    const listings = await NewsletterService.selectListings(now, excluded);

    const recipients = input.recipientsOverride
      ? input.recipientsOverride.map((r) => ({ ...r, _id: '' }))
      : await MarketingConsentService.listRecipients();

    // Rien a envoyer : on n'ecrit pas de campagne, sinon la cle est consommee
    // et le premier envoi reel de la journee passe a la trappe.
    if (listings.length === 0 || recipients.length === 0) {
      logger.info(
        { key, listings: listings.length, recipients: recipients.length },
        'Newsletter non envoyee : rien a envoyer',
      );
      return {
        alreadySent: false,
        listingIds: [],
        recipientCount: 0,
        successCount: 0,
        failureCount: 0,
      };
    }

    let campaign;
    try {
      campaign = await NewsletterCampaignModel.create({
        key,
        periodStart,
        periodEnd: now,
        listingIds: listings.map((l) => new Types.ObjectId(l.id)),
        status: 'RUNNING',
        recipientCount: recipients.length,
        initiatedBy: input.initiatedBy,
      });
    } catch (err) {
      // L'index unique sur `key` est le vrai garde-fou contre la course, pas
      // le `findOne` plus haut : deux declenchements quasi simultanes (cron
      // qui chevauche son execution precedente, retry du planificateur) passent
      // tous les deux le test et n'échouent qu'a l'ecriture. Intercepter le
      // doublon evite de renvoyer un 500 alors que le comportement voulu — ne
      // rien renvoyer de plus — est deja atteint par l'autre appel.
      if ((err as { code?: number }).code === 11000) {
        logger.info({ key }, 'Newsletter deja en cours pour cette periode — envoi ignore');
        return {
          alreadySent: true,
          listingIds: listings.map((l) => l.id),
          recipientCount: recipients.length,
          successCount: 0,
          failureCount: 0,
        };
      }
      throw err;
    }

    let successCount = 0;
    let failureCount = 0;
    let lastError: string | null = null;

    // Envoi par lots de SEND_CONCURRENCY. Un `Promise.all` sur toute la liste
    // ouvrirait autant de sockets Resend qu'il y a de destinataires : sur une
    // liste qui grossit, c'est un risque de 429 et de blacklist, pas un gain
    // de temps.
    for (let i = 0; i < recipients.length; i += SEND_CONCURRENCY) {
      const batch = recipients.slice(i, i + SEND_CONCURRENCY);
      await Promise.all(
        batch.map(async (recipient) => {
          // try/catch par destinataire : une adresse morte ne doit pas
          // interrompre les destinataires suivants ni faire echouer la
          // campagne entiere. Resend leve sur un refus d'API, et son SDK leve
          // aussi sur un timeout reseau.
          try {
            await EmailService.sendWeeklyTopListings({
              to: recipient.email,
              firstName: recipient.firstName,
              listings: listings.map((l) => ({
                title: l.title,
                slug: l.slug,
                price: l.price,
                currency: l.currency,
                gameName: l.gameName,
                gameSlug: l.gameSlug,
                country: l.country,
              })),
              unsubscribeUrl: NewsletterService.unsubscribeUrl(recipient.unsubscribeToken),
            });
            successCount += 1;
          } catch (err) {
            failureCount += 1;
            lastError = err instanceof Error ? err.message.slice(0, 500) : String(err).slice(0, 500);
            logger.error(
              { err, to: recipient.email, key },
              'Echec envoi newsletter a un destinataire',
            );
          }
        }),
      );
    }

    const status =
      failureCount === 0 ? 'COMPLETED' : successCount === 0 ? 'FAILED' : 'PARTIAL';

    await NewsletterCampaignModel.updateOne(
      { _id: campaign._id },
      { $set: { status, successCount, failureCount, lastError } },
    );

    await AuditService.log({
      actor: input.initiatedBy,
      action: 'newsletter.sent',
      entityType: 'NewsletterCampaign',
      entityId: String(campaign._id),
      metadata: {
        key,
        recipients: recipients.length,
        successCount,
        failureCount,
        listings: listings.length,
      },
    });

    logger.info(
      { key, recipients: recipients.length, successCount, failureCount, listings: listings.length },
      'Newsletter envoyee',
    );

    return {
      alreadySent: false,
      listingIds: listings.map((l) => l.id),
      recipientCount: recipients.length,
      successCount,
      failureCount,
    };
  }

  /**
   * Selection courante sans envoi : alimente l'apercu de l'admin.
   *
   * Meme requete que le vrai envoi, y compris l'exclusion de l'historique,
   * pour que l'apercu montre exactement ce qui partirait — un apercu qui
   * divergerait de l'envoi reel serait pire qu'absence d'apercu.
   */
  static async preview(now: Date = new Date()): Promise<{
    listings: NewsletterListing[];
    recipientCount: number;
    key: string;
  }> {
    const excluded = await NewsletterService.recentlyFeaturedListingIds();
    const listings = await NewsletterService.selectListings(now, excluded);
    const recipients = await MarketingConsentService.listRecipients();
    return {
      listings,
      recipientCount: recipients.length,
      key: NewsletterService.campaignKey(now),
    };
  }
}
