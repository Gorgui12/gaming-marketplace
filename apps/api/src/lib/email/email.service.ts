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
   *
   * Laisse la rejection remonter : les 18 appelants sont tous en
   * fire-and-forget avec leur propre `.catch()`, qui était jusque-là du
   * code mort puisque cette méthode avalait tout en interne. Un échec
   * d'envoi doit donc rester observable.
   */
  private static async send(
    to: string,
    subject: string,
    html: string,
    tag: string,
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

  static async sendDisputeResolved(params: {
    to: string;
    firstName: string;
    role: 'buyer' | 'seller';
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
}