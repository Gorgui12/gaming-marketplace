import { Resend } from 'resend';
import { logger } from '../logger.js';
import { env } from '../../config/env.js';
import { emailTemplates } from './email.templates.js';

const resend = new Resend(env.RESEND_API_KEY);

export class EmailService {
  private static async send(to: string, subject: string, html: string) {
    try {
      const { error } = await resend.emails.send({
        from: env.RESEND_FROM,
        to,
        subject,
        html,
      });
      if (error) {
        throw new Error(error.message);
      }
      logger.info({ to, subject }, 'Email envoyé');
    } catch (err) {
      logger.error(
        {
          err,
          to,
          subject,
          from: env.RESEND_FROM,
        },
        'Échec d\'envoi d\'email',
      );
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
      from: env.RESEND_FROM,
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
    try {
      const { error } = await resend.emails.send({
        from: env.RESEND_FROM,
        to: sendTo,
        subject: `Test Resend GamingMarket — ${new Date().toLocaleString('fr-FR')}`,
        html: '<p>Ceci est un email de test envoyé depuis le back-office de GamingMarket.</p>',
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
    await this.send(to, subject, html);
  }

  static async sendPasswordReset(to: string, firstName: string, resetUrl: string) {
    const { subject, html } = emailTemplates.passwordReset(firstName, resetUrl);
    await this.send(to, subject, html);
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
    await this.send(params.to, subject, html);
  }

  static async sendTransactionPaymentConfirmed(params: {
    to: string;
    firstName: string;
    role: 'buyer' | 'seller';
    transactionId: string;
    listingTitle: string;
  }) {
    const { subject, html } = emailTemplates.transactionPaymentConfirmed(params);
    await this.send(params.to, subject, html);
  }

  static async sendTransactionPaymentFailed(params: {
    to: string;
    firstName: string;
    transactionId: string;
    listingTitle: string;
  }) {
    const { subject, html } = emailTemplates.transactionPaymentFailed(params);
    await this.send(params.to, subject, html);
  }

  static async sendTransactionDelivered(params: {
    to: string;
    firstName: string;
    role: 'buyer' | 'seller';
    transactionId: string;
    listingTitle: string;
  }) {
    const { subject, html } = emailTemplates.transactionDelivered(params);
    await this.send(params.to, subject, html);
  }

  static async sendTransactionCompleted(params: {
    to: string;
    firstName: string;
    role: 'buyer' | 'seller';
    transactionId: string;
    listingTitle: string;
    sellerAmount?: number;
    currency?: string;
  }) {
    const { subject, html } = emailTemplates.transactionCompleted(params);
    await this.send(params.to, subject, html);
  }

  static async sendTransactionRefunded(params: {
    to: string;
    firstName: string;
    transactionId: string;
    listingTitle: string;
    reason: string;
  }) {
    const { subject, html } = emailTemplates.transactionRefunded(params);
    await this.send(params.to, subject, html);
  }

  static async sendListingApproved(params: { to: string; firstName: string; listingTitle: string }) {
    const { subject, html } = emailTemplates.listingApproved(params);
    await this.send(params.to, subject, html);
  }

  static async sendListingRejected(params: {
    to: string;
    firstName: string;
    listingTitle: string;
    notes?: string;
  }) {
    const { subject, html } = emailTemplates.listingRejected(params);
    await this.send(params.to, subject, html);
  }

  static async sendListingRemoved(params: { to: string; firstName: string; listingTitle: string }) {
    const { subject, html } = emailTemplates.listingRemoved(params);
    await this.send(params.to, subject, html);
  }

  static async sendAccountSuspended(params: { to: string; firstName: string; reason: string }) {
    const { subject, html } = emailTemplates.accountSuspended(params);
    await this.send(params.to, subject, html);
  }

  static async sendAccountBanned(params: { to: string; firstName: string; reason: string }) {
    const { subject, html } = emailTemplates.accountBanned(params);
    await this.send(params.to, subject, html);
  }

  static async sendDisputeResolved(params: {
    to: string;
    firstName: string;
    role: 'buyer' | 'seller';
    transactionId: string;
    resolution: string;
  }) {
    const { subject, html } = emailTemplates.disputeResolved(params);
    await this.send(params.to, subject, html);
  }

  static async sendSellerStatusChanged(params: {
    to: string;
    firstName: string;
    status: string;
  }) {
    const { subject, html } = emailTemplates.sellerStatusChanged(params);
    await this.send(params.to, subject, html);
  }
}