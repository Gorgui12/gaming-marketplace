import nodemailer from 'nodemailer';
import { env } from '../../config/env.js';
import { emailTemplates } from './email.templates.js';

const transporter = nodemailer.createTransport({
  host: env.SMTP_HOST,
  port: env.SMTP_PORT,
  secure: env.SMTP_PORT === 465,
  auth: {
    user: env.SMTP_USER,
    pass: env.SMTP_PASSWORD,
  },
});

export class EmailService {
  private static async send(to: string, subject: string, html: string) {
    try {
      await transporter.sendMail({
        from: env.SMTP_FROM,
        to,
        subject,
        html,
      });
    } catch (err) {
      // Les emails ne doivent jamais casser le flow applicatif
      // eslint-disable-next-line no-console
      console.error('[EmailService] Erreur envoi email:', err);
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
