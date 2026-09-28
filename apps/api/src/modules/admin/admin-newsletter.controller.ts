import type { Request, Response } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../lib/async-handler.js';
import { AppError } from '../../lib/errors/app-error.js';
import { ErrorCode } from '../../lib/errors/error-codes.js';
import { EmailService } from '../../lib/email/email.service.js';
import { AuditService } from '../audit/audit.service.js';
import { UserModel } from '../users/user.model.js';
import { env } from '../../config/env.js';
import { NewsletterService } from '../newsletter/newsletter.service.js';
import { NewsletterCampaignModel } from '../newsletter/newsletter-campaign.model.js';

/**
 * Back-office de la newsletter.
 *
 * Trois besoins distincts, et le troisième est le plus important :
 *  1. l'historique : quel envoi a parti, quand, avec quel taux de reussite ;
 *  2. l'apercu : QUELLES annonces partiraient maintenant ;
 *  3. le test : s'assurer du rendu et des en-tetes sur une vraie adresse
 *     AVANT de laisser le cron toucher la liste.
 *
 * L'envoi reel n'est volontairement PAS triggerable d'ici en un clic. Il passe
 * par le endpoint cron, donc par une decision deliberee de changer une
 * frequence dans cron-job.org. Un bouton « envoyer a toute la liste » dans
 * l'admin serait une arme de confusion massive : un double-clic et la
 * newsletter est partie a toute la base, et il n'y a aucun retour en arriere
 * sur une boite mail. Le test a soi-meme suffit a valider le rendu.
 */

const testSchema = z.object({
  to: z.string().email('Adresse email invalide'),
});

/** Pagination de l'historique. */
const historyQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(50).default(20),
});

/** GET /api/v1/admin/newsletter/history */
export const listCampaigns = asyncHandler(async (req: Request, res: Response) => {
  const { page, pageSize } = historyQuerySchema.parse(req.query);
  const skip = (page - 1) * pageSize;

  const [campaigns, total] = await Promise.all([
    NewsletterCampaignModel.find({})
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(pageSize)
      .lean(),
    NewsletterCampaignModel.countDocuments({}),
  ]);

  res.status(200).json({
    success: true,
    data: {
      campaigns: campaigns.map((c) => ({
        ...c,
        listingIds: c.listingIds.map((id) => String(id)),
      })),
      page,
      total,
      // Même forme que les autres listes de l'admin (disputes, users) pour que
      // le composant `Pagination` soit réutilisable sans adaptation.
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    },
  });
});

/**
 * GET /api/v1/admin/newsletter/preview
 *
 * Ce que partirait maintenant : memes requetes, meme exclusion d'historique et
 * meme plancher de vues que l'envoi reel. Un apercu qui divergerait de
 * l'envoi serait pire que pas d'apercu du tout.
 */
export const previewCampaign = asyncHandler(async (_req: Request, res: Response) => {
  const preview = await NewsletterService.preview();
  res.status(200).json({ success: true, data: preview });
});

/**
 * POST /api/v1/admin/newsletter/test
 *
 * Envoie la newsletter en cours a UNE adresse, choisie par l'admin.
 *
 * Le destinataire est force dans la liste des consentants et doit avoir un
 * email verifie : on reutilise ainsi exactement le meme code d'envoi que
 * l'envoi reel, en-tetes de desinscription compris. C'est le seul moyen de
 * verifier que le bouton « Se desabonner » fonctionne avant de l'exposer a
 * toute la liste.
 *
 * L'email doit appartenir a un compte consentant. Ce n'est pas un detail :
 * le test reutilise le vrai code d'envoi, donc l'exiger ici interdit que
 * l'endpoint devienne un moyen d'envoyer le message commercial a une adresse
 * arbitraire — un seul destinataire aujourd'hui, mais c'est une regle qu'on
 * ne casse pas pour un besoin de confort.
 */
export const sendTestNewsletter = asyncHandler(async (req: Request, res: Response) => {
  const input = testSchema.parse(req.body);

  const recipient = await UserModel.findOne({
    email: input.to.toLowerCase(),
    'marketing.optedIn': true,
    emailVerified: true,
  }).select('+marketing.unsubscribeToken firstName');

  if (!recipient) {
    throw new AppError(
      ErrorCode.VALIDATION_ERROR,
      "Cette adresse n'est pas inscrite a la newsletter. Utilisez l'email d'un compte ayant coche la case a l'inscription, ou activez-la depuis son profil.",
      400,
    );
  }
  if (!recipient.marketing?.unsubscribeToken) {
    throw new AppError(
      ErrorCode.VALIDATION_ERROR,
      "Aucun token de desinscription pour ce compte — l'inscription est incomplete.",
      400,
    );
  }

  const excluded = await NewsletterService.recentlyFeaturedListingIds();
  const listings = await NewsletterService.selectListings(new Date(), excluded);

  if (listings.length === 0) {
    throw new AppError(
      ErrorCode.VALIDATION_ERROR,
      "Aucune annonce ne remplit les criteres de la newsletter. Verifiez NEWSLETTER_MIN_VIEWS et la fraicheur des annonces publiees.",
      400,
    );
  }

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
    unsubscribeUrl: `${env.API_PUBLIC_URL}/api/v1/unsubscribe/${recipient.marketing.unsubscribeToken}`,
  });

  await AuditService.log({
    actor: req.user!.id,
    action: 'newsletter.test_sent',
    entityType: 'User',
    entityId: String(recipient._id),
    metadata: { to: recipient.email, listings: listings.length },
  });

  res.status(200).json({
    success: true,
    data: { to: recipient.email, listingCount: listings.length },
  });
});
