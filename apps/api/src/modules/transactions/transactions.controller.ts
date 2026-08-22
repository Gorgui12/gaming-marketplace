import type { Request, Response } from 'express';
import { asyncHandler } from '../../lib/async-handler.js';
import { SecureAccountAccessService } from './secure-account-access.service.js';
import {
  confirmTransactionSchema,
  deliverAccountAccessSchema,
  initiateTransactionSchema,
} from '@gm/validation';
import { TransactionsService } from './transactions.service.js';
import { PaymentService } from '../payments/payments.service.js';
import { corsAllowedOrigins } from '../../config/env.js';

/**
 * URL de retour après paiement PayDunya : on réutilise l'origine d'où vient
 * réellement l'acheteur (header Origin du fetch), validée contre la liste
 * CORS. Si l'app web tourne sur un autre port que le premier origine CORS,
 * l'acheteur serait sinon renvoyé vers un serveur qui ne connaît pas la
 * route /dashboard/buyer — d'où des 404 au retour de paiement.
 */
function resolveReturnUrl(req: Request): string {
  const origin = req.headers.origin;
  if (origin && corsAllowedOrigins.includes(origin)) {
    return `${origin}/dashboard/buyer`;
  }
  return `${corsAllowedOrigins[0]}/dashboard/buyer`;
}

export const createTransaction = asyncHandler(async (req: Request, res: Response) => {
  const input = initiateTransactionSchema.parse(req.body);
  const transaction = await TransactionsService.createFromListing({
    listingId: input.listingId,
    buyerId: req.user!.id,
    promoCode: input.promoCode,
    sessionId: input.sessionId,
  });

  const payment = await PaymentService.initiateForTransaction({
    transactionId: String(transaction._id),
    buyerName: req.user!.id, // TODO: remplacer par le vrai nom une fois le profil chargé
    buyerEmail: '', // TODO: charger depuis le profil User
    // Le dashboard acheteur déclenche la vérification active du paiement
    // à l'affichage (filet de sécurité si l'IPN n'est jamais arrivé).
    returnUrl: resolveReturnUrl(req),
  });

  res.status(201).json({ success: true, data: { transaction, paymentUrl: payment.paymentUrl } });
});

export const deliverTransaction = asyncHandler(async (req: Request, res: Response) => {
  const input = deliverAccountAccessSchema.parse(req.body);
  const transaction = await TransactionsService.deliver({
    transactionId: input.transactionId,
    sellerId: req.user!.id,
    credentialsPlaintext: input.credentialsPayload,
  });
  res.status(200).json({ success: true, data: { transaction } });
});

export const confirmTransaction = asyncHandler(async (req: Request, res: Response) => {
  const input = confirmTransactionSchema.parse(req.body);
  const transaction = await TransactionsService.confirm({
    transactionId: input.transactionId,
    buyerId: req.user!.id,
  });
  res.status(200).json({ success: true, data: { transaction } });
});

/**
 * Filet de sécurité si l'IPN PayDunya n'arrive jamais: on interroge
 * directement leur API (invoice.confirm sur le token stocké côté serveur)
 * et on avance la transaction si le paiement est confirmé. Appelé par le
 * dashboard acheteur au retour de la page de paiement.
 */
export const verifyTransactionPayment = asyncHandler(async (req: Request, res: Response) => {
  const result = await PaymentService.syncPaymentStatus({
    transactionId: req.params.id!,
    userId: req.user!.id,
  });
  res.status(200).json({
    success: true,
    data: { transaction: result.transaction, synced: result.synced },
  });
});

export const getTransaction = asyncHandler(async (req: Request, res: Response) => {
  const isAdmin = req.user!.roles.includes('ADMIN') || req.user!.roles.includes('SUPER_ADMIN');
  const transaction = await TransactionsService.getById(req.params.id!, req.user!.id, isAdmin);
  res.status(200).json({ success: true, data: { transaction } });
});

export const adminRefundTransaction = asyncHandler(async (req: Request, res: Response) => {
  const transaction = await TransactionsService.adminRefund({
    transactionId: req.params.id!,
    adminId: req.user!.id,
    reason: String(req.body?.reason ?? 'Non précisé'),
  });
  res.status(200).json({ success: true, data: { transaction } });
});
export const listMyTransactions = asyncHandler(async (req: Request, res: Response) => {
  const transactions = await TransactionsService.listMine(req.user!.id);
  res.status(200).json({ success: true, data: { transactions } });
});

export const getTransactionAccess = asyncHandler(async (req: Request, res: Response) => {
  const { plaintext } = await SecureAccountAccessService.getForBuyer({
    transactionId: req.params.id!,
    buyerId: req.user!.id,
  });
  res.status(200).json({ success: true, data: { credentials: plaintext } });
});