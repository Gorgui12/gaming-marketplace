import { Resend } from 'resend';
import { logger } from '../logger.js';
import { env } from '../../config/env.js';
import { emailTemplates } from './email.templates.js';
import { htmlToText } from './html-to-text.js';

const resend = new Resend(env.RESEND_API_KEY);

/**
 * Normalise RESEND_FROM : si l'environnement (docker env_file, provider
 * PaaS…) a conservé les guillemets du `.env`, on les retire pour éviter
 * `Invalid from field` chez Resend. Ne touche pas une valeur déjà propre.
 */
function normalizeFrom(raw: string): string {
  let value = raw.trim();
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1).trim();
  }
  return value;
}

export class EmailService {
  /**
   * Point d'envoi unique.
   *
   * - `text` en plus de `html` : sans partie texte brut l'email part en
   *   HTML-only, ce qu'Apple Mail / iCloud Mail sanctionne au point de
   *   classer le message en indésirables (Gmail et Outlook le tolèrent).
   * - `replyTo` : `noreply@` sans adresse de réponse est un signal
   *   « envoi de masse » pour les filtres, et rendait inopérant le
   *   « répondez à cet email » présent dans plusieurs templates.
   * - `tags` : permet de filtrer les envois par type dans le dashboard
   *   Resend.
   * - `headers` : réservé aux en-tetes RFC 8058 de la newsletter
   *   (`List-Unsubscribe`). Volontairement absent des envois transactionnels :
   *   un lien de desinscription sur un email de paiement donnerait au lecteur
   *   une raison de se desabonner d'alertes qu'il veut justement recevoir, et
   *   le client mail enverrait un signal de desinscription alors que le
   *   transactional reste parfaitement sollicite.
   *
   * Laisse la rejection remonter : les appelants sont tous en
   * fire-and-forget avec leur propre `.catch()`, qui était jusque-là du
   * code mort puisque cette méthode avalait tout en interne. Un échec
   * d'envoi doit donc rester observable.
   */
  private static async send(
    to: string,
    subject: string,
    html: string,
    tag: string,
    headers?: Record<string, string>,
  ): Promise<void> {
    const from = normalizeFrom(env.RESEND_FROM);
    try {
      const { data, error } = await resend.emails.send({
        from,
        to,
        subject,
        html,
        text: htmlToText(html),
        replyTo: env.RESEND_REPLY_TO,
        tags: [{ name: 'categorie', value: tag }],
        ...(headers ? { headers } : {}),
      });
      if (error) {
        throw new Error(error.message);
      }
      logger.info({ to, subject, tag, id: data?.id }, 'Email envoyé');
    } catch (err) {
      logger.error(
        {
          err,
          to,
          subject,
          tag,
          from,
          replyTo: env.RESEND_REPLY_TO,
        },
        'Échec d\'envoi d\'email',
      );
      throw err;
    }
  }

  /**
   * Vérifie que l'API Resend répond. N'envoie aucun email.
   */
  static async verifyConnection(): Promise<{ ok: boolean; error?: string }> {
    try {
      await resend.domains.list();
      return { ok: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error({ err }, 'Échec de connexion Resend');
      return { ok: false, error: message };
    }
  }

  /**
   * État Resend pour le dashboard admin (GET /api/v1/admin/email/status).
   */
  static async getStatus(): Promise<{
    ok: boolean;
    provider: string;
    from: string;
    error?: string;
  }> {
    const result = await this.verifyConnection();
    return {
      ok: result.ok,
      provider: 'resend',
      from: normalizeFrom(env.RESEND_FROM),
      error: result.error,
    };
  }

  /**
   * Diagnostic complet pour le back-office (/api/v1/admin/email/test) :
   * vérifie l'API Resend puis envoie un email de test (optionnel).
   */
  static async testEmail(sendTo?: string): Promise<{
    ok: boolean;
    stage: 'connexion' | 'envoi';
    error?: string;
    message?: string;
  }> {
    try {
      await resend.domains.list();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.warn({ err }, 'Échec connexion Resend (test)');
      return { ok: false, stage: 'connexion', error: message };
    }
    if (!sendTo) {
      return {
        ok: true,
        stage: 'connexion',
        message: 'Resend joignable et authentifié',
      };
    }
    const testHtml = emailTemplates.welcome('Test').html;
    try {
      const { error } = await resend.emails.send({
        from: normalizeFrom(env.RESEND_FROM),
        to: sendTo,
        subject: `Test Resend GamingMarket — ${new Date().toLocaleString('fr-FR')}`,
        html: testHtml,
        text: htmlToText(testHtml),
        replyTo: env.RESEND_REPLY_TO,
      });
      if (error) throw new Error(error.message);
      return {
        ok: true,
        stage: 'envoi',
        message: `Email de test envoyé vers ${sendTo}`,
      };
    } catch (err) {
      return {
        ok: false,
        stage: 'envoi',
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  static async sendWelcome(to: string, firstName: string) {
    const { subject, html } = emailTemplates.welcome(firstName);
    await this.send(to, subject, html, 'welcome');
  }

  static async sendPasswordReset(to: string, firstName: string, resetUrl: string) {
    const { subject, html } = emailTemplates.passwordReset(firstName, resetUrl);
    await this.send(to, subject, html, 'password-reset');
  }

  static async sendEmailVerification(to: string, firstName: string, verifyUrl: string) {
    const { subject, html } = emailTemplates.emailVerification(firstName, verifyUrl);
    await this.send(to, subject, html, 'verification');
  }

  static async sendTransactionCreated(params: {
    to: string;
    firstName: string;
    role: 'buyer' | 'seller';
    transactionId: string;
    listingTitle: string;
    amount: number;
    currency: string;
  }) {
    const { subject, html } = emailTemplates.transactionCreated(params);
    await this.send(params.to, subject, html, 'transaction-created');
  }

  static async sendTransactionPaymentConfirmed(params: {
    to: string;
    firstName: string;
    role: 'buyer' | 'seller';
    transactionId: string;
    listingTitle: string;
  }) {
    const { subject, html } = emailTemplates.transactionPaymentConfirmed(params);
    await this.send(params.to, subject, html, 'payment-confirmed');
  }

  static async sendTransactionPaymentFailed(params: {
    to: string;
    firstName: string;
    transactionId: string;
    listingTitle: string;
  }) {
    const { subject, html } = emailTemplates.transactionPaymentFailed(params);
    await this.send(params.to, subject, html, 'payment-failed');
  }

  static async sendTransactionDelivered(params: {
    to: string;
    firstName: string;
    role: 'buyer' | 'seller';
    transactionId: string;
    listingTitle: string;
  }) {
    const { subject, html } = emailTemplates.transactionDelivered(params);
    await this.send(params.to, subject, html, 'delivered');
  }

  static async sendTransactionCompleted(params: {
    to: string;
    firstName: string;
    role: 'buyer' | 'seller';
    transactionId: string;
    listingTitle: string;
    amount?: number;
    platformFee?: number;
    sellerAmount?: number;
    currency?: string;
  }) {
    const { subject, html } = emailTemplates.transactionCompleted(params);
    await this.send(params.to, subject, html, 'transaction-completed');
  }

  static async sendTransactionRefunded(params: {
    to: string;
    firstName: string;
    transactionId: string;
    listingTitle: string;
    reason: string;
  }) {
    const { subject, html } = emailTemplates.transactionRefunded(params);
    await this.send(params.to, subject, html, 'refunded');
  }

  static async sendListingApproved(params: { to: string; firstName: string; listingTitle: string }) {
    const { subject, html } = emailTemplates.listingApproved(params);
    await this.send(params.to, subject, html, 'listing-approved');
  }

  static async sendListingRejected(params: {
    to: string;
    firstName: string;
    listingTitle: string;
    notes?: string;
  }) {
    const { subject, html } = emailTemplates.listingRejected(params);
    await this.send(params.to, subject, html, 'listing-rejected');
  }

  static async sendListingRemoved(params: { to: string; firstName: string; listingTitle: string }) {
    const { subject, html } = emailTemplates.listingRemoved(params);
    await this.send(params.to, subject, html, 'listing-removed');
  }

  static async sendAccountSuspended(params: { to: string; firstName: string; reason: string }) {
    const { subject, html } = emailTemplates.accountSuspended(params);
    await this.send(params.to, subject, html, 'account-suspended');
  }

  static async sendAccountBanned(params: { to: string; firstName: string; reason: string }) {
    const { subject, html } = emailTemplates.accountBanned(params);
    await this.send(params.to, subject, html, 'account-banned');
  }

  static async sendDisputeOpened(params: {
    to: string;
    firstName: string;
    role: 'buyer' | 'seller';
    transactionId: string;
    reason: string;
  }) {
    const { subject, html } = emailTemplates.disputeOpened(params);
    await this.send(params.to, subject, html, 'dispute-opened');
  }

  static async sendDisputeResolved(params: {
    to: string;
    firstName: string;
    role: 'buyer' | 'seller';
    outcome: 'BUYER' | 'SELLER';
    transactionId: string;
    resolution: string;
  }) {
    const { subject, html } = emailTemplates.disputeResolved(params);
    await this.send(params.to, subject, html, 'dispute-resolved');
  }

  static async sendSellerStatusChanged(params: {
    to: string;
    firstName: string;
    status: string;
  }) {
    const { subject, html } = emailTemplates.sellerStatusChanged(params);
    await this.send(params.to, subject, html, 'seller-status');
  }

  /**
   * Point d'entrée pour un email rédigé depuis le back-office.
   *
   * Seule voie publique qui accepte un sujet et un HTML fournis par
   * l'appelant : les 18 méthodes ci-dessus passent toutes par un template
   * `email.templates.ts` où chaque valeur est échappée. Ici le HTML vient
   * d'un `<textarea>` admin, il est donc désinfecté par l'appelant
   * (`sanitizeEmailHtml`) avant d'arriver ici.
   *
   * On ne touche pas à la signature de `send` : la modifier obligerait à
   * relire ses 18 appelants alors qu'un point d'entrée supplémentaire suffit
   * et laisse le chemin transactionnel strictement inchangé.
   *
   * `kind` décide des en-têtes, et cette décision est prise ici plutôt que
   * chez l'appelant : c'est le dernier point où l'on sait si l'envoi est
   * commercial ou transactionnel, et il n'y a qu'une seule manière de le
   * respecter. Un `COMMERCIAL` sans lien de désinscription est un email
   * commercial sans issue pour le lecteur, donc la garde refuse l'envoi
   * plutôt que de laisser passer un message non conforme.
   */
  static async sendAdminBroadcast(params: {
    to: string;
    subject: string;
    html: string;
    kind: 'COMMERCIAL' | 'TRANSACTIONAL';
    unsubscribeUrl?: string;
  }): Promise<void> {
    if (params.kind === 'COMMERCIAL' && !params.unsubscribeUrl) {
      throw new Error(
        'Envoi commercial sans lien de désinscription — refusing d\'envoyer un message sollicité sans issue pour le lecteur.',
      );
    }
    const headers =
      params.kind === 'COMMERCIAL' && params.unsubscribeUrl
        ? {
            // Les deux en-têtes vont de pair (RFC 8058) : Gmail et Yahoo
            // n'affichent le bouton « Se désabonner » que si les deux sont
            // présents, et un `List-Unsubscribe` seul est ignoré par plusieurs
            // clients. Le `<...>` est la forme multiple imposée par la RFC 2369.
            'List-Unsubscribe': `<${params.unsubscribeUrl}>`,
            'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
          }
        : undefined;
    await this.send(
      params.to,
      params.subject,
      params.html,
      `admin-${params.kind.toLowerCase()}`,
      headers,
    );
  }

  /**
   * Newsletter : selection des comptes les plus consultes.
   *
   * Seul envoi commercial du systeme, et seul appelant de `headers`. Les deux
   * en-tetes vont de pair et ne doivent jamais etre separes : Gmail et Yahoo
   * n'affichent le bouton "Se desabonner" que si les deux sont presents
   * (RFC 8058), et un `List-Unsubscribe` seul sans en-tete `Post` est ignore
   * par plusieurs clients.
   *
   * Le `<...>` autour de l'URL n'est pas un artifice de template : c'est la
   * forme multiple imposee par la RFC 2369, qui autorise plusieurs adresses
   * dans un meme en-tete.
   */
  static async sendWeeklyTopListings(params: {
    to: string;
    firstName: string;
    listings: Array<{
      title: string;
      slug: string;
      price: string;
      currency: string;
      gameName: string;
      gameSlug: string;
      country: string;
    }>;
    unsubscribeUrl: string;
  }) {
    const { subject, html } = emailTemplates.weeklyTopListings(params);
    await this.send(params.to, subject, html, 'newsletter', {
      'List-Unsubscribe': `<${params.unsubscribeUrl}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    });
  }
}