import dns from 'node:dns';
import net from 'node:net';
import nodemailer from 'nodemailer';
import { logger } from '../logger.js';
import { env } from '../../config/env.js';
import { emailTemplates } from './email.templates.js';

const TIMEOUTS = {
  // Timeouts explicites : si le port est bloqué (ex: cloud) ou le serveur
  // muet, on échoue vite et le log est distinctif — sinon nodemailer peut
  // attendre ~2 minutes par email et multiplier les envois fantômes.
  connectionTimeout: 15_000,
  greetingTimeout: 15_000,
  socketTimeout: 30_000,
} as const;

/**
 * Construit un transport SMTP dont la connexion est pilotée IPv4.
 *
 * nodemailer mélange les records A + AAAA de l'hôte et en choisit un de façon
 * aléatoire : sur les plateformes sans route IPv6 (Railway, etc.) ça peut
 * partir en `ENETUNREACH` sur l'adresse IPv6 au lieu de retomber sur l'IPv4 —
 * et le message d'erreur exposé est alors trompeur. Ici on résout nous-mêmes
 * l'IPv4 (les serveurs LWS en ont toujours) et on garde le hostname d'origine
 * comme `servername` pour que SNI + vérification du certificat TLS restent
 * valides (ça marche aussi bien en 465 direct qu'en 587 STARTTLS).
 */
async function buildTransporter(opts: { host?: string; port?: number; secure?: boolean }) {
  const hostname = opts.host || env.SMTP_HOST;
  const port = opts.port ?? env.SMTP_PORT;
  const secure = opts.secure ?? env.SMTP_PORT === 465;

  let host = hostname;
  let tls: { servername: string } | undefined;
  if (!net.isIP(hostname)) {
    try {
      const { address } = await dns.promises.lookup(hostname, { family: 4 });
      host = address;
      tls = { servername: hostname };
    } catch {
      // Garde-fou : si la résolution IPv4 échoue, on laisse nodemailer
      // résoudre lui-même plutôt que de bloquer l'envoi.
    }
  }

  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: {
      user: env.SMTP_USER,
      pass: env.SMTP_PASSWORD,
    },
    tls,
    ...TIMEOUTS,
  });
}

type SmtpTransporter = ReturnType<typeof nodemailer.createTransport>;

let globalTransporter: Promise<SmtpTransporter> | null = null;

async function getSmtpTransporter(): Promise<SmtpTransporter> {
  if (!globalTransporter) {
    globalTransporter = buildTransporter({});
  }
  return globalTransporter;
}

export class EmailService {
  private static async send(to: string, subject: string, html: string) {
    try {
      const transporter = await getSmtpTransporter();
      await transporter.sendMail({
        from: env.SMTP_FROM,
        to,
        subject,
        html,
      });
      logger.info({ to, subject }, 'Email envoyé');
    } catch (err) {
      // Les emails ne doivent jamais casser le flow applicatif, mais l'échec
      // DOIT être visible dans les logs (pino, en production → Cloud Logging)
      // pour pouvoir diagnostiquer un SMTP muet.
      logger.error(
        {
          err,
          to,
          subject,
          smtpHost: env.SMTP_HOST,
          smtpPort: env.SMTP_PORT,
        },
        'Échec d\'envoi d\'email',
      );
    }
  }

  /**
   * Vérifie que le transport SMTP répond (connexion + authentification).
   * N'envoie aucun email. Retourne un résultat sans jamais exposer le
   * secret SMTP.
   */
  static async verifyConnection(): Promise<{ ok: boolean; error?: string }> {
    try {
      const transporter = await getSmtpTransporter();
      await transporter.verify();
      return { ok: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error(
        { smtpHost: env.SMTP_HOST, smtpPort: env.SMTP_PORT, err },
        'Échec de connexion SMTP',
      );
      return { ok: false, error: message };
    }
  }

  /**
   * État SMTP pour le dashboard admin (GET /api/v1/admin/email/status) —
   * visible immédiatement sur la plateforme, sans secret exposé.
   */
  static async getStatus(): Promise<{
    ok: boolean;
    host: string;
    port: number;
    secure: boolean;
    error?: string;
  }> {
    const result = await this.verifyConnection();
    return {
      ok: result.ok,
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_PORT === 465,
      error: result.error,
    };
  }

  /**
   * Diagnostic complet pour le back-office (/api/v1/admin/email/test) :
   * 1) connexion + auth SMTP, 2) envoi d'un email de test (optionnel).
   * `overrides` permet de tester un hôte/port alternatif (ex: port 587)
   * SANS toucher au .env — le transport du diagnostic est temporaire.
   */
  static async testSmtp(
    sendTo?: string,
    overrides?: { host?: string; port?: number; secure?: boolean },
  ): Promise<{
    ok: boolean;
    stage: 'connexion' | 'envoi';
    usedHost?: string;
    usedPort?: number;
    error?: string;
    message?: string;
  }> {
    const host = overrides?.host || env.SMTP_HOST;
    const port = overrides?.port ?? env.SMTP_PORT;
    const secure = overrides?.secure ?? env.SMTP_PORT === 465;

    const hasOverrides =
      overrides?.host || overrides?.port !== undefined || overrides?.secure !== undefined;

    const testTransporter = hasOverrides
      ? await buildTransporter({ host, port, secure })
      : await getSmtpTransporter();

    try {
      await testTransporter.verify();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.warn({ usedHost: host, usedPort: port, err }, 'Échec connexion SMTP (test)');
      return { ok: false, stage: 'connexion', usedHost: host, usedPort: port, error: message };
    }
    if (!sendTo) {
      return {
        ok: true,
        stage: 'connexion',
        usedHost: host,
        usedPort: port,
        message: 'SMTP joignable et authentifié',
      };
    }
    try {
      await testTransporter.sendMail({
        from: env.SMTP_FROM,
        to: sendTo,
        subject: `Test SMTP GamingMarket — ${new Date().toLocaleString('fr-FR')}`,
        html: '<p>Ceci est un email de test envoyé depuis le back-office de GamingMarket.</p>',
      });
      return {
        ok: true,
        stage: 'envoi',
        usedHost: host,
        usedPort: port,
        message: `Email de test envoyé vers ${sendTo}`,
      };
    } catch (err) {
      return {
        ok: false,
        stage: 'envoi',
        usedHost: host,
        usedPort: port,
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
