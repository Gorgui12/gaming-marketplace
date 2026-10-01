import { UserModel } from '../../modules/users/user.model.js';
import { AdminEmailSendModel } from '../../modules/admin/admin-email-send.model.js';
import { EmailService } from './email.service.js';
import { htmlToText } from './html-to-text.js';
import {
  extractVariables,
  renderTemplate,
  sanitizeEmailHtml,
  TEMPLATE_VARIABLES,
  type TemplateVariable,
} from './sanitize-email-html.js';
import { MarketingConsentService } from '../../modules/newsletter/marketing-consent.service.js';
import { AppError } from '../errors/app-error.js';
import { ErrorCode } from '../errors/error-codes.js';
import { env } from '../../config/env.js';
import { logger } from '../logger.js';

/**
 * Envoi d'emails HTML rédigés depuis le back-office.
 *
 * Contraintes non négociables, et leur raison :
 *
 *  1. **Asynchrone.** À 5 envois en parallèle, 2 000 destinataires dépassent
 *     le timeout HTTP puis celui du proxy : l'admin verrait un 502 au moment
 *     précis où la campagne est partie, et pourrait la relancer. La route
 *     répond 202, le travail continue dans le processus, l'admin suit
 *     l'avancement par polling de l'historique.
 *
 *  2. **Consentement lié au type d'envoi.** Un `COMMERCIAL` ne part qu'aux
 *     consentants, avec `List-Unsubscribe`. Un `TRANSACTIONAL` ignore le
 *     consentement marketing — un message de maintenance doit arriver à
 *     quelqu'un qui s'est désabonné de la newsletter — mais ne porte jamais
 *     de lien de désinscription, conformément à la règle que `send` documente.
 *
 *  3. **Interpolation par destinataire.** `{{firstName}}` est remplacé dans la
 *     boucle, pas une fois pour toutes : la variable dépend du destinataire.
 *     C'est aussi ce qui rend l'envoi en masse supportable côté lecture.
 *
 *  4. **Isolation des échecs.** `try/catch` par destinataire, comme la
 *     newsletter : une adresse morte ne doit pas interrompre les suivantes.
 *
 * Limite assumée : le travail vit dans le processus de l'API. Un redémarrage
 * en plein envoi laisse un document `RUNNING` — `reapStaleRuns()` le marque
 * `FAILED` au démarrage suivant, donc l'historique ne ment pas, mais l'envoi
 * est bien interrompu. Passer à une file durable est le chantier si l'hébergement
 * devient multi-instance ou redémarre souvent.
 */

const SEND_CONCURRENCY = env.ADMIN_EMAIL_CONCURRENCY;

/** Au-delà, un redéploiement en plein envoi devient probable. */
const STALE_RUNNING_MS = 30 * 60 * 1000;

/** Garde-fou réseau : un envoi ne peut pas partir vers n'importe qui. */
const MAX_RECIPIENTS = 20_000;

export type BroadcastKind = 'COMMERCIAL' | 'TRANSACTIONAL';

export interface BroadcastRecipient {
  _id: string;
  email: string;
  firstName: string;
  lastName: string;
  username: string;
  country: string;
  currency: string;
  unsubscribeUrl: string;
}

function unsubscribeUrlFor(token: string): string {
  return `${env.API_PUBLIC_URL}/api/v1/unsubscribe/${token}`;
}

/**
 * Destinataires selon le type d'envoi.
 *
 * `COMMERCIAL` réutilise `MarketingConsentService.listRecipients()` plutôt que
 * de dupliquer ses quatre filtres : une seconde implémentation des mêmes
 * conditions finirait par diverger, et c'est cette divergence qui enverrait un
 * message commercial à quelqu'un qui s'est désabonné.
 *
 * `TRANSACTIONAL` exclut malgré tout les comptes non vérifiés et non actifs :
 * un email de compte vers une adresse saisie de travers est un rebond quasi
 * garanti, et vers un compte banni c'est une sollicitation d'infraction.
 */
export async function selectRecipients(
  kind: BroadcastKind,
  limit = MAX_RECIPIENTS,
): Promise<BroadcastRecipient[]> {
  if (kind === 'COMMERCIAL') {
    const consented = await MarketingConsentService.listRecipients();
    return consented.slice(0, limit).map((u) => ({
      _id: u._id,
      email: u.email,
      firstName: u.firstName,
      lastName: '',
      username: '',
      country: '',
      currency: '',
      // Un consentement sans token ne peut pas produire de lien de
      // désinscription ; `listRecipients` filtre déjà ce cas.
      unsubscribeUrl: u.unsubscribeToken ? unsubscribeUrlFor(u.unsubscribeToken) : '',
    }));
  }

  const users = await UserModel.find({
    emailVerified: true,
    status: 'ACTIVE',
  })
    .select('email firstName lastName username country currency')
    .limit(limit)
    .lean();

  return users.map((u) => ({
    _id: String(u._id),
    email: u.email,
    firstName: u.firstName,
    lastName: u.lastName,
    username: u.username,
    country: u.country,
    currency: u.currency,
    // Aucun lien de désinscription sur un email transactionnel : le lecteur
    // ne doit pas pouvoir se désabonner d'une alerte de paiement.
    unsubscribeUrl: '',
  }));
}

/**
 * Variables inconnues dans le corps, et variables obligatoires manquantes.
 *
 * Detected AVANT tout envoi : une variable mal orthographiée laisserait
 * literally `{{fistName}}` dans le mail de toute la liste, ce que personne ne
 * remarque avant que les lecteurs ne le signalent.
 */
export function inspectVariables(
  html: string,
  kind: BroadcastKind,
): { unknown: string[]; missingUnsubscribe: boolean } {
  const present = extractVariables(html);
  const known = new Set<string>(TEMPLATE_VARIABLES);
  const unknown = present.filter((v) => !known.has(v));
  const missingUnsubscribe =
    kind === 'COMMERCIAL' && !present.includes('unsubscribeUrl');
  return { unknown, missingUnsubscribe };
}

/** Contexte d'interpolation pour un destinataire. */
function contextFor(r: BroadcastRecipient): Record<TemplateVariable, string> {
  return {
    firstName: r.firstName,
    lastName: r.lastName,
    email: r.email,
    username: r.username,
    country: r.country,
    currency: r.currency,
    unsubscribeUrl: r.unsubscribeUrl,
  };
}

export interface BroadcastInput {
  subject: string;
  html: string;
  kind: BroadcastKind;
  initiatedBy: string;
  /**
   * Destinataires forcés — réservé aux tests.
   */
  recipientsOverride?: BroadcastRecipient[];
  /**
   * Passe-droit pour un envoi au-delà de `ADMIN_EMAIL_BULK_THRESHOLD`.
   *
   * L'admin ne le pose pas spontanément : la première requête est refusée avec
   * le nombre exact de destinataires, et l'interface le redemande après avoir
   * affiché ce nombre. Voir le garde-fou dans `startBroadcast`.
   */
  confirmedLargeSend?: boolean;
}

/**
 * Contexte factice pour l'aperçu et le test.
 *
 * Valeurs volontairement plausibles et cohérentes entre elles — prénom et nom
 * qui vont ensemble, un pays et sa devise (`SN`/`XOF`) — parce que l'admin juge
 * de la mise en page à partir de ce qu'il voit : un `{{currency}}` rendu « EUR »
 * sous une adresse sénégalaise trahirait un template mal thoughté, alors que la
 * valeur exacte n'a aucun importance fonctionnelle.
 */
export function sampleContext(
  to: string,
  unsubscribeUrl?: string,
): Record<TemplateVariable, string> {
  return {
    firstName: 'Awa',
    lastName: 'Diop',
    email: to,
    username: 'awa.diop',
    country: 'SN',
    currency: 'XOF',
    // L'URL de substitution n'est jamais cliquable en pratique — elle sert
    // seulement à vérifier que la variable tombe au bon endroit et que le lien
    // produit ressemble à un vrai lien de désinscription.
    unsubscribeUrl: unsubscribeUrl ?? 'https://exemple.test/desinscription',
  };
}

/**
 * Crée le document d'envoi puis lance le traitement en arrière-plan.
 *
 * Retourne immédiatement : l'appelant répond 202 et ne fait pas attendre
 * l'admin. Les destinataires sont résolus ICI et non dans la boucle, pour que
 * `recipientCount` soit exact dans l'historique dès l'affichage — sans quoi la
 * confirmation « vous allez envoyer à N personnes » n'aurait pas de N.
 */
export async function startBroadcast(input: BroadcastInput): Promise<{
  sendId: string;
  recipientCount: number;
}> {
  const sanitized = sanitizeEmailHtml(input.html);
  const { unknown, missingUnsubscribe } = inspectVariables(sanitized, input.kind);

  if (unknown.length > 0) {
    throw new AppError(
      ErrorCode.VALIDATION_ERROR,
      `Variable(s) inconnue(s) : ${unknown.join(', ')}. Variables acceptées : ${TEMPLATE_VARIABLES.join(', ')}.`,
      400,
    );
  }
  if (missingUnsubscribe) {
    throw new AppError(
      ErrorCode.VALIDATION_ERROR,
      "Un envoi commercial doit contenir {{unsubscribeUrl}} : sans lien de désinscription, le message n'a pas d'issue pour le lecteur, et Gmail comme Resend traitent cela comme du spam non sollicité.",
      400,
    );
  }
  if (sanitized.trim() === '') {
    throw new AppError(
      ErrorCode.VALIDATION_ERROR,
      'Le corps de l\'email est vide après désinfection.',
      400,
    );
  }

  const recipients = input.recipientsOverride ?? (await selectRecipients(input.kind));
  if (recipients.length === 0) {
    throw new AppError(
      ErrorCode.VALIDATION_ERROR,
      'Aucun destinataire ne correspond à ce type d\'envoi. Rien à envoyer.',
      400,
    );
  }

  // Confirmation en deux temps au-delà du seuil. Le nombre est résolu ICI,
  // donc il est exact : c'est lui que l'interface affiche avant de demander
  // la confirmation, et non un ordre de grandeur. Refuser puis renvoyer avec
  // `confirmedLargeSend` est plus robuste qu'un `window.confirm` côté front,
  // qui n'empêcherait pas un appel direct à l'API.
  if (
    !input.confirmedLargeSend &&
    input.recipientsOverride === undefined &&
    recipients.length >= env.ADMIN_EMAIL_BULK_THRESHOLD
  ) {
    throw new AppError(
      ErrorCode.VALIDATION_ERROR,
      `Envoi de masse : ${recipients.length} destinataires. Un email parti ne se rattrape pas — relancez la requête avec \`confirmedLargeSend: true\` après avoir vérifié le nombre et l'aperçu.`,
      409,
    );
  }

  const record = await AdminEmailSendModel.create({
    subject: input.subject,
    kind: input.kind,
    html: sanitized,
    rawHtml: input.html,
    status: 'RUNNING',
    recipientCount: recipients.length,
    initiatedBy: input.initiatedBy,
  });

  // Volontairement pas `await` : la route doit répondre 202 avant que le
  // premier destinataire ne soit contacté. Le `catch` est indispensable —
  // sans lui, un rejet en arrière-plan devient un `unhandledRejection` qui
  // tue le processus Node sous Node 20.
  void runBroadcast(String(record._id), input, sanitized, recipients).catch((err) => {
    logger.error({ err, sendId: String(record._id) }, 'Échec du traitement d\'envoi en arrière-plan');
  });

  return { sendId: String(record._id), recipientCount: recipients.length };
}

/**
 * Traitement par lots. Non exporté : appelé uniquement par `startBroadcast`.
 *
 * La structure reprend celle de `NewsletterService.sendCampaign` — lots de
 * `SEND_CONCURRENCY`, `try/catch` par destinataire. Un `Promise.all` sur toute
 * la liste ouvrirait autant de sockets Resend qu'il y a de destinataires, ce
 * qui est un risque de 429 et de blacklist à mesure que la base grandit.
 */
async function runBroadcast(
  sendId: string,
  input: BroadcastInput,
  sanitizedHtml: string,
  recipients: BroadcastRecipient[],
): Promise<void> {
  let successCount = 0;
  let failureCount = 0;
  let lastError: string | null = null;

  for (let i = 0; i < recipients.length; i += SEND_CONCURRENCY) {
    const batch = recipients.slice(i, i + SEND_CONCURRENCY);
    await Promise.all(
      batch.map(async (recipient) => {
        try {
          // Interpolation ici, et non une fois pour toutes : les variables
          // sont des attributs du destinataire. `renderTemplate` échappe
          // chaque valeur, donc un prénom contenant du markup ne peut pas
          // casser la mise en page chez tous les destinataires.
          const html = renderTemplate(sanitizedHtml, contextFor(recipient));
          await EmailService.sendAdminBroadcast({
            to: recipient.email,
            subject: input.subject,
            html,
            kind: input.kind,
            // Un `COMMERCIAL` a déjà été validé comme contenant
            // `{{unsubscribeUrl}}`, et `selectRecipients` garantit un token
            // pour tout consentant. Le `|| undefined` couvre le seul cas
            // atteignable : un test passé avec un destinataire sans token,
            // que `sendAdminBroadcast` refuse par sécurité.
            ...(input.kind === 'COMMERCIAL'
              ? { unsubscribeUrl: recipient.unsubscribeUrl || undefined }
              : {}),
          });
          successCount += 1;
        } catch (err) {
          failureCount += 1;
          const message = err instanceof Error ? err.message : String(err);
          lastError = message.slice(0, 500);
          logger.error(
            { err, to: recipient.email, sendId, subject: input.subject },
            'Échec envoi admin à un destinataire',
          );
        }
      }),
    );
  }

  const status =
    failureCount === 0 ? 'COMPLETED' : successCount === 0 ? 'FAILED' : 'PARTIAL';

  await AdminEmailSendModel.updateOne(
    { _id: sendId },
    { $set: { status, successCount, failureCount, lastError } },
  );

  logger.info(
    { sendId, kind: input.kind, subject: input.subject, recipients: recipients.length, successCount, failureCount },
    'Envoi admin terminé',
  );
}

/**
 * Envoie le message a un seul destinataire, sans toucher à l'historique.
 *
 * Même rendu que l'envoi réel, en-têtes de désinscription compris : c'est le
 * seul moyen de vérifier qu'un template s'affiche correctement avant de
 * l'exposer à toute la liste. Ne crée volontairement aucun document
 * `AdminEmailSend` — un test n'est pas un envoi, et le polluer l'historique
 * ferait perdre le fil de ce qui est vraiment parti.
 */
export async function sendTestBroadcast(params: {
  to: string;
  subject: string;
  html: string;
  kind: BroadcastKind;
  /** Destinataire témoin pour le lien de désinscription du test. */
  unsubscribeUrl?: string;
}): Promise<void> {
  const sanitized = sanitizeEmailHtml(params.html);
  const { unknown } = inspectVariables(sanitized, params.kind);
  if (unknown.length > 0) {
    throw new AppError(
      ErrorCode.VALIDATION_ERROR,
      `Variable(s) inconnue(s) : ${unknown.join(', ')}.`,
      400,
    );
  }

  // Contexte factice : le test valide le RENDU, pas les données d'un
  // destinataire réel.
  const html = renderTemplate(sanitized, sampleContext(params.to, params.unsubscribeUrl));

  await EmailService.sendAdminBroadcast({
    to: params.to,
    subject: params.subject,
    html,
    kind: params.kind,
    ...(params.kind === 'COMMERCIAL'
      ? { unsubscribeUrl: params.unsubscribeUrl ?? 'https://exemple.test/desinscription' }
      : {}),
  });
}

/**
 * Marque `FAILED` les envois `RUNNING` trop anciens.
 *
 * Appelé au démarrage du serveur. Un document reste `RUNNING` pendant toute
 * la durée d'un envoi, ce qui est normal ; il ne doit le rester qu'entre deux
 * redémarrages. Sans ce balayage, l'historique afficherait indéfiniment des
 * envois « en cours » dont personne n'a plus la trace — un `RUNNING` de trois
 * jours est un mensonge, pas un état.
 */
export async function reapStaleRuns(): Promise<number> {
  const threshold = new Date(Date.now() - STALE_RUNNING_MS);
  const result = await AdminEmailSendModel.updateMany(
    { status: 'RUNNING', createdAt: { $lt: threshold } },
    {
      $set: {
        status: 'FAILED',
        lastError:
          'Envoi interrompu : l\'API a redémarré pendant le traitement. Les destinataires non contactés n\'ont pas reçu le message.',
      },
    },
  );
  if (result.modifiedCount > 0) {
    logger.warn(
      { count: result.modifiedCount },
      'Envois RUNNING trop anciens marqués FAILED au démarrage',
    );
  }
  return result.modifiedCount;
}

/** Rendu texte du HTML, pour l'aperçu texte de l'admin. */
export function previewText(html: string): string {
  return htmlToText(sanitizeEmailHtml(html));
}

/**
 * Aperçu du rendu final, sans envoi.
 *
 * Renvoie le HTML interpolé ET sa version texte, parce que ce sont deux
 * rendus réellement distincts : le second est ce que voient les clients mail
 * qui refusent ou n'affichent pas le HTML, et c'est souvent lui qui est cassé
 * quand le premier a l'air correct. Un aperçu qui n'en montrait qu'un
 * laisserait passer ce cas.
 *
 * Ne lève volontairement PAS sur un `COMMERCIAL` sans `{{unsubscribeUrl}}` :
 * c'est un problème d'INTERFACE, pas d'envoi. L'admin doit pouvoir rédiger un
 * template et le relire avant d'ajouter la variable — une validation qui bloque
 * dès la frappe l'empêcherait simplement de voir son brouillon. Le problème
 * est renvoyé dans `issues` pour être affiché, et `startBroadcast` refusera
 * l'envoi plus tard.
 */
export function previewBroadcast(params: {
  html: string;
  kind: BroadcastKind;
}): { html: string; text: string; issues: { unknown: string[]; missingUnsubscribe: boolean } } {
  const sanitized = sanitizeEmailHtml(params.html);
  const { unknown, missingUnsubscribe } = inspectVariables(sanitized, params.kind);
  // L'adresse témoin n'apparaît dans aucun lien du corps : les seules URL
  // possibles sont celles de l'admin lui-même, écrites à la main.
  const rendered = renderTemplate(sanitized, sampleContext('awa.diop@exemple.test'));
  return {
    html: rendered,
    text: htmlToText(rendered),
    issues: { unknown, missingUnsubscribe },
  };
}
