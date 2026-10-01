import type { Request, Response } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../lib/async-handler.js';
import { EmailService } from '../../lib/email/email.service.js';
import { AppError } from '../../lib/errors/app-error.js';
import { ErrorCode } from '../../lib/errors/error-codes.js';
import {
  previewBroadcast,
  selectRecipients,
  sendTestBroadcast,
  startBroadcast,
} from '../../lib/email/email-broadcast.service.js';
import { TEMPLATE_VARIABLES } from '../../lib/email/sanitize-email-html.js';
import { AdminEmailSendModel } from './admin-email-send.model.js';
import { AuditService } from '../audit/audit.service.js';
import { env } from '../../config/env.js';

/**
 * Back-office d'envoi d'emails rédigés à la main.
 *
 * Cinq besoins, et l'ordre n'est pas indifférent : il faut savoir combien de
 * personnes seront contactées, relire le rendu, le tester sur une vraie boîte,
 * puis seulement envoyer — et l'historique dit ce qui est vraiment parti.
 *
 *   1. `GET  /recipients`  → combien, et selon quel filtre
 *   2. `POST /preview`      → le rendu, désinfecté et interpolé
 *   3. `POST /test`         → le rendu dans une vraie boîte mail
 *   4. `POST /send`         → l'envoi, asynchrone, 202
 *   5. `GET  /history`      → ce qui est parti
 *
 * Le contraste avec `admin-newsletter.controller.ts` est volontaire. La
 * newsletter se déclenche par cron, sur une sélection de listings calculée par
 * le serveur : l'admin ne choisit ni le texte ni les destinataires, donc un
 * bouton d'envoi y serait une arme de confusion. Ici l'admin rédige le message
 * ET vise une audience — c'est précisément pour ça que l'envoi est confirmé par
 * un nombre explicite au-delà de `ADMIN_EMAIL_BULK_THRESHOLD`.
 */

const testEmailSchema = z.object({
  to: z.string().email('Adresse email invalide').optional(),
});

/**
 * Corps commun au composeur.
 *
 * `html` est borné en taille : un email est un document, pas une pièce jointe.
 * Sans plafond, une textarea de 40 Mo traverserait le corps de `express.json`
 * et l'API épuiserait sa mémoire pour un message que Resend refuserait de toute
 * façon.
 */
const composeSchema = z.object({
  subject: z.string().trim().min(1, 'L\'objet est obligatoire').max(200, 'Objet trop long'),
  html: z.string().max(200_000, 'Corps trop volumineux (200 Ko maximum)'),
  kind: z.enum(['COMMERCIAL', 'TRANSACTIONAL']),
});

/**
 * Schéma de l'aperçu : le corps seul.
 *
 * L'objet est délibérément absent. Il n'entre dans aucun calcul du rendu, et
 * l'exiger ici produirait une erreur dès la première lettre du corps tapée —
 * l'interface écrit le HTML avant l'objet, et un message « l'objet est
 * obligatoire » au milieu de la rédaction fait croire à un bug. L'objet reste
 * obligatoire pour l'envoi, où il est réellement envoyé.
 */
const previewSchema = z.object({
  html: z.string().max(200_000, 'Corps trop volumineux (200 Ko maximum)'),
  kind: z.enum(['COMMERCIAL', 'TRANSACTIONAL']),
});

const testBroadcastSchema = composeSchema.extend({
  to: z.string().email('Adresse email invalide'),
});

const sendBroadcastSchema = composeSchema.extend({
  confirmedLargeSend: z.boolean().optional().default(false),
});

/** Pagination de l'historique. */
const historyQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(50).default(20),
});

export const testEmail = asyncHandler(async (req: Request, res: Response) => {
  const input = testEmailSchema.parse(req.body ?? {});
  const result = await EmailService.testEmail(input.to);
  // Toujours 200 + success:true : le détail (ok/error) vit dans result et
  // le front admin l'affiche — un service KO n'est pas une erreur HTTP.
  res.status(200).json({ success: true, data: { result } });
});

export const getEmailStatus = asyncHandler(async (_req: Request, res: Response) => {
  const status = await EmailService.getStatus();
  res.status(200).json({ success: true, data: { status } });
});

/**
 * GET /api/v1/admin/emails/recipients
 *
 * Le nombre AVANT d'envoyer, et non après. Sans lui, l'admin n'a aucun moyen de
 * savoir s'il va écrire à 40 personnes ou à 4 000 avant de déclencher quoi que
 * ce soit — et c'est précisément cette information qui doit déclencher la
 * confirmation renforcée.
 *
 * Les deux populations sont renvoyées d'un coup : comparer les deux chiffres
 * côte à côte (consentants contre comptes actifs vérifiés) évite à l'admin de
 * changer le type d'envoi pour « découvrir » l'ampleur de l'écart, et
 * documente en passant qu'un `COMMERCIAL` touche bien moins de monde.
 */
export const countRecipients = asyncHandler(async (req: Request, res: Response) => {
  const { kind } = z
    .object({ kind: z.enum(['COMMERCIAL', 'TRANSACTIONAL']).default('COMMERCIAL') })
    .parse(req.query);

  const recipients = await selectRecipients(kind);

  res.status(200).json({
    success: true,
    data: {
      kind,
      recipientCount: recipients.length,
      // Au-delà de ce seuil, l'envoi exige une confirmation explicite. Envoyé
      // au front pour que le seuil affiché soit celui réellement appliqué, et
      // non une valeur recopiée qui divergerait un jour.
      bulkThreshold: env.ADMIN_EMAIL_BULK_THRESHOLD,
      // Liste des variables insérables, dans la même réponse que le reste du
      // contexte de rédaction. Elle voyage avec le chargement de page pour que
      // le composeur propose ses variables AVANT la première lettre tapée : les
      // faire dépendre d'un aperçu obligerait à écrire du HTML pour découvrir
      // ce qu'on peut écrire dedans.
      //
      // C'est l'API qui fait foi. Une liste recopiée dans le front divergerait
      // au premier ajout de variable, et le composeur proposerait alors un
      // `{{…}}` que l'envoi refuse.
      variables: TEMPLATE_VARIABLES,
    },
  });
});

/**
 * POST /api/v1/admin/emails/preview
 *
 * Désinfection, contrôle des variables, interpolation — la chaîne exacte de
 * l'envoi, arrêtée juste avant le premier contact. La désinfection se fait
 * ICI et pas dans le navigateur : un aperçu calculé côté client montrerait un
 * rendu que l'envoi ne produira pas, ce qui est pire que pas d'aperçu.
 */
export const previewEmail = asyncHandler(async (req: Request, res: Response) => {
  const input = previewSchema.parse(req.body ?? {});
  res.status(200).json({ success: true, data: previewBroadcast(input) });
});

/**
 * POST /api/v1/admin/emails/test
 *
 * Le message part réellement, à une seule adresse choisie par l'admin, avec les
 * en-têtes de désinscription s'il s'agit d'un `COMMERCIAL`.
 *
 * Contrairement au test de newsletter, aucune contrainte de consentement n'est
 * imposée sur l'adresse : l'admin doit pouvoir tester sur sa boîte personnelle,
 * qui a toutes les chances de ne pas être abonnée à la newsletter — refuser
 * cette adresse le priverait du seul test qu'il peut faire en conditions
 * réelles. Ce que la route protège, c'est la quantité et la liste : un
 * destinataire, choisi par un SUPER_ADMIN ou un ADMIN, jamais une audience.
 */
export const sendEmailTest = asyncHandler(async (req: Request, res: Response) => {
  const input = testBroadcastSchema.parse(req.body ?? {});

  await sendTestBroadcast({
    to: input.to.toLowerCase(),
    subject: input.subject,
    html: input.html,
    kind: input.kind,
  });

  await AuditService.log({
    actor: req.user!.id,
    action: 'admin_email.test_sent',
    entityType: 'AdminEmailSend',
    entityId: 'test',
    metadata: { to: input.to, kind: input.kind, subject: input.subject },
  });

  res.status(200).json({ success: true, data: { to: input.to } });
});

/**
 * POST /api/v1/admin/emails/send
 *
 * 202 et non 200 : l'envoi est asynchrone, le travail continue après la
 * réponse. Un 200 « envoyé » serait un mensonge — il dirait que les N messages
 * sont partis alors qu'ils sont peut-être encore en file. L'admin suit
 * l'avancement dans l'historique, qui passe de `RUNNING` à `COMPLETED`,
 * `PARTIAL` ou `FAILED`.
 */
export const sendEmailBroadcast = asyncHandler(async (req: Request, res: Response) => {
  const input = sendBroadcastSchema.parse(req.body ?? {});

  const { sendId, recipientCount } = await startBroadcast({
    subject: input.subject,
    html: input.html,
    kind: input.kind,
    initiatedBy: 'admin:web',
    confirmedLargeSend: input.confirmedLargeSend,
  });

  await AuditService.log({
    actor: req.user!.id,
    action: 'admin_email.broadcast_started',
    entityType: 'AdminEmailSend',
    entityId: sendId,
    metadata: { kind: input.kind, recipientCount, subject: input.subject },
  });

  res.status(202).json({ success: true, data: { sendId, recipientCount } });
});

/**
 * GET /api/v1/admin/emails/history
 *
 * La forme suit celle de l'historique newsletter (`campaigns`, `page`,
 * `total`, `totalPages`) pour que le composant `Pagination` du front soit
 * réutilisable sans adaptation.
 */
export const listEmailSends = asyncHandler(async (req: Request, res: Response) => {
  const { page, pageSize } = historyQuerySchema.parse(req.query);
  const skip = (page - 1) * pageSize;

  const [sends, total] = await Promise.all([
    AdminEmailSendModel.find({})
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(pageSize)
      .select('-html -rawHtml')
      .lean(),
    AdminEmailSendModel.countDocuments({}),
  ]);

  res.status(200).json({
    success: true,
    data: {
      sends,
      page,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    },
  });
});

/**
 * GET /api/v1/admin/emails/:id
 *
 * Relit le corps EXACT d'un envoi. C'est la raison pour laquelle le HTML est
 * stocké : quand un destinataire signale avoir reçu « un mail bizarre », la
 * seule réponse possible est de lire ce qui est parti. `rawHtml` est renvoyé
 * en plus du HTML désinfecté, sinon impossible de comprendre ce que la
 * désinfection a retiré — et une désinfection qui retire trop est un bug
 * qu'on ne peut pas voir sans elle.
 */
export const getEmailSend = asyncHandler(async (req: Request, res: Response) => {
  const send = await AdminEmailSendModel.findById(req.params.id).lean();
  if (!send) {
    throw AppError.notFound(ErrorCode.NOT_FOUND, 'Envoi introuvable');
  }
  res.status(200).json({ success: true, data: { send } });
});
