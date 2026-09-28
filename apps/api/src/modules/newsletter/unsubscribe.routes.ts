import type { Request, Response } from 'express';
import { Router } from 'express';
import { env } from '../../config/env.js';
import { logger } from '../../lib/logger.js';
import { asyncHandler } from '../../lib/async-handler.js';
import { MarketingConsentService } from './marketing-consent.service.js';

/**
 * Desinscription a la newsletter.
 *
 * Routeur PUBLIC, sans `requireAuth` : c'est une exigence de la RFC 8058. Les
 * clients mail (Gmail, Apple Mail, Outlook) affichent un bouton "Se
 * desinscrire" et appellent directement l'URL de l'en-tete
 * `List-Unsubscribe`. Cette requete ne transporte aucun cookie de session
 * nostre part, donc aucune authentification ne pourrait passer.
 *
 * Le secret est le token lui-meme, tire au hasard a l'opt-in et non devinable.
 *
 * Deux verbes pour une meme URL, conformement a la RFC 8058 :
 *  - POST : le client mail appelle la desinscription immediate, sans
 *    afficher de page. Reponse 200 et corps vide.
 *  - GET  : un humain suit le lien du pied d'email et atterrit sur une page
 *    de confirmation.
 *
 * Note CSRF : les deux requetes passent `csrfGuard`. Le POST du client mail
 * n'envoie pas d'en-tete `Origin`, et `csrfGuard` laisse passer les requetes
 * sans Origin (voir csrf.middleware.ts) ; le formulaire GET, lui, est renvoye
 * par l'API et son action est postee vers l'API, donc meme origine. Aucune
 * exemption n'est necessaire.
 */

/** Longueur attendue d'un token : 32 octets en hex. */
const TOKEN_RE = /^[a-f0-9]{64}$/i;

function page(body: string, title: string): string {
  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title} - Gaming Marketplace</title>
<style>
  body{margin:0;padding:40px 20px;background:#eef2f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#334155;line-height:1.6}
  .card{max-width:520px;margin:0 auto;background:#fff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden}
  .head{background:#d4af37;padding:28px 24px;text-align:center}
  .head h1{margin:0;font-size:22px;color:#0f172a}
  .head p{margin:6px 0 0;font-size:13px;color:#4a3800}
  .body{padding:32px 24px}
  .body h2{margin:0 0 16px;padding-bottom:12px;border-bottom:2px solid #d4af37;color:#0f172a;font-size:20px}
  a.btn{display:inline-block;background:#d4af37;color:#0f172a;text-decoration:none;padding:13px 26px;border-radius:8px;border:1px solid #b8962e;font-weight:600;font-size:15px;margin:8px 0}
  a.btn.ghost{background:#fff;color:#334155;border-color:#cbd5e1}
  .foot{padding:20px 24px;text-align:center;color:#64748b;font-size:12px;border-top:1px solid #e2e8f0;background:#f8fafc}
  code{background:#f1f5f9;padding:2px 6px;border-radius:4px;font-size:13px}
</style>
</head>
<body>
<div class="card">
  <div class="head">
    <h1>Gaming Marketplace</h1>
    <p>La marketplace des comptes de jeux</p>
  </div>
  <div class="body">${body}</div>
  <div class="foot">${env.APP_URL.replace(/^https?:\/\//, '')}</div>
</div>
</body>
</html>`;
}

/**
 * GET /api/v1/unsubscribe/:token
 *
 * Page de confirmation. Ne desinscrit RIEN : un lien d'email peut avoir ete
 * transfere, previsualise, ou recoit par un antivirus. Exiger un clic
 * explicite evite qu'un simple chargement d'URL (prefetch du client mail,
 * scan de securite) ne desinscrive quelqu'un qui ne l'a pas demande.
 */
export const showUnsubscribePage = async (req: Request, res: Response): Promise<void> => {
  const token = req.params.token ?? '';
  if (!TOKEN_RE.test(token)) {
    res
      .status(400)
      .type('html')
      .send(
        page(
          `<h2>Lien invalide</h2><p>Ce lien de desinscription est mal forme. Si vous ne souhaitez plus recevoir la newsletter, rendez-vous dans <strong>Mon profil &rarr; Notifications et emails</strong>.</p>`,
          'Lien invalide',
        ),
      );
    return;
  }

  res.type('html').send(
    page(
      `<h2>Ne plus recevoir la newsletter ?</h2>
       <p>Vous ne recevrez plus les emails de decouverte des 5 comptes les plus consultes. Vos emails de compte (paiements, litiges, securite) ne sont pas concernes.</p>
       <div style="text-align:center;margin:24px 0">
         <form method="POST" action="${env.API_PUBLIC_URL}/api/v1/unsubscribe/${token}">
           <button class="btn" type="submit" style="cursor:pointer">Confirmer ma desinscription</button>
         </form>
       </div>
       <div style="text-align:center;margin:8px 0">
         <a class="btn ghost" href="${env.APP_URL}">Retour a la marketplace</a>
       </div>`,
      'Desinscription',
    ),
  );
};

/**
 * POST /api/v1/unsubscribe/:token
 *
 * Desinscription immediate. Repond 200 corps vide conformement a la RFC 8058,
 * qui impose de ne rien afficher au client mail.
 *
 * Repond 200 meme sur token inconnu : distinguer les cas permettrait d'enumerer
 * les tokens valides.
 */
export const confirmUnsubscribe = async (req: Request, res: Response): Promise<void> => {
  const token = req.params.token ?? '';

  if (TOKEN_RE.test(token)) {
    try {
      await MarketingConsentService.unsubscribeByToken(token);
    } catch (err) {
      // Un client mail n'a personne a qui signaler l'echec, et un corps vide
      // reste la seule reponse conforme. On journalise pour l'exploitant.
      logger.error({ err }, 'Echec desinscription newsletter');
    }
  }

  res.status(200).type('text/plain').send('');
};

/**
 * Routeur PUBLIC de desinscription, monte sur /api/v1/unsubscribe.
 *
 * Volontairement isole de `adminRouter` et de tout `requireAuth` : c'est une
 * exigence de la RFC 8058, les clients mail appellent cette URL sans cookie.
 */
export const unsubscribeRouter = Router();

unsubscribeRouter.get('/:token', asyncHandler(showUnsubscribePage));
unsubscribeRouter.post('/:token', asyncHandler(confirmUnsubscribe));
