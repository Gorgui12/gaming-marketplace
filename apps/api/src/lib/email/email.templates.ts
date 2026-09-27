import { env } from '../../config/env.js';

/**
 * Échappe les caractères HTML spéciaux avant interpolation dans un
 * template email. Toute valeur d'origine utilisateur (firstName,
 * listingTitle, reason, notes, resolution...) DOIT passer par cette
 * fonction avant d'être insérée dans le HTML — sinon un utilisateur peut
 * casser la mise en page ou injecter du balisage arbitraire dans un email
 * envoyé depuis notre domaine (voir audit sécurité).
 */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Palette claire.
 *
 * Le thème sombre précédent (fond marine, bandeau doré, un unique bouton
 * pilule centré) reproduisait exactement la structure qu'Apple/iCloud
 * classe comme phishing : image de marque sombre + une seule action. Le
 * filtre de contenu d'iCloud Mail s'appuyait dessus pour mettre les emails
 * en indésirables alors que Gmail les laissait passer. On garde l'identité
 * dorée de la marque, mais sur fond clair et avec des contrastes conformes
 * au WCAG AA — l'or `#d4af37` sur blanc ne plafonnait qu'à 2,1:1, donc
 * illisible en texte.
 */
const PAGE_BG = '#eef2f7';
const SURFACE = '#ffffff';
const BORDER = '#e2e8f0';
const TEXT = '#334155';
const TEXT_STRONG = '#0f172a';
const TEXT_MUTED = '#64748b';
const GOLD = '#d4af37';
const GOLD_INK = '#8a6d0b';
const DANGER = '#b91c1c';
const SUCCESS = '#15803d';

const BASE_STYLE = `
  margin: 0; padding: 0; box-sizing: border-box;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
`;

// URL publique de l'app web, utilisée pour les boutons "call to action" des
// emails. Configurée via APP_URL côté serveur API — remplace les anciens
// fallbacks vers localhost.
const APP_URL = env.APP_URL;

const BUYER_DASHBOARD_URL = `${APP_URL}/dashboard/buyer`;
const SELLER_DASHBOARD_URL = `${APP_URL}/dashboard/seller`;
const MARKETPLACE_URL = `${APP_URL}/marketplace`;

const SUPPORT_EMAIL = env.EMAIL_SUPPORT_ADDRESS;

const CONTAINER_STYLE = `
  max-width: 600px; margin: 0 auto; background: ${SURFACE};
  border: 1px solid ${BORDER}; border-radius: 12px; overflow: hidden;
`;

const HEADER_STYLE = `
  background: ${GOLD}; padding: 28px 24px; text-align: center;
`;

const BODY_STYLE = `
  padding: 32px 24px; color: ${TEXT}; font-size: 15px; line-height: 1.6;
`;

const BUTTON_STYLE = `
  display: inline-block; background: ${GOLD}; color: ${TEXT_STRONG};
  text-decoration: none; padding: 14px 28px; border-radius: 8px;
  border: 1px solid #b8962e; font-weight: 600; font-size: 15px; margin: 8px 0;
`;

const FOOTER_STYLE = `
  padding: 24px; text-align: center; color: ${TEXT_MUTED}; font-size: 12px;
  line-height: 1.6; border-top: 1px solid ${BORDER}; background: #f8fafc;
`;

/** Encadré d'information (montant, référence, motif…). */
const BOX_STYLE = `background:#f8fafc;padding:16px;border-radius:8px;margin:16px 0;border:1px solid ${BORDER};`;
const BOX_LABEL_STYLE = `margin:0;color:${TEXT_MUTED};font-size:13px;`;
const BOX_VALUE_STYLE = `margin:4px 0 0;color:${TEXT_STRONG};font-size:15px;`;

const MUTED_STYLE = `margin:0;color:${TEXT_MUTED};font-size:13px;`;

/** Bloc "call to action" centré. */
function cta(url: string, label: string): string {
  return `<div style="text-align:center;margin:24px 0;">
        <a href="${url}" style="${BUTTON_STYLE}">${label}</a>
      </div>`;
}

function wrap(title: string, bodyHtml: string): string {
  return `<!DOCTYPE html>
<html lang="fr">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="${BASE_STYLE}">
  <div style="padding:24px;background:${PAGE_BG};">
    <div style="${CONTAINER_STYLE}">
      <div style="${HEADER_STYLE}">
        <h1 style="margin:0;font-size:22px;color:${TEXT_STRONG};">Gaming Marketplace</h1>
        <p style="margin:6px 0 0;font-size:13px;color:#4a3800;">La marketplace des comptes de jeux</p>
      </div>
      <div style="${BODY_STYLE}">
        <h2 style="margin:0 0 20px;padding-bottom:12px;border-bottom:2px solid ${GOLD};color:${TEXT_STRONG};font-size:20px;">${title}</h2>
        ${bodyHtml}
      </div>
      <div style="${FOOTER_STYLE}">
        <p style="margin:0 0 6px;">Gaming Marketplace &mdash; ${APP_URL.replace(/^https?:\/\//, '')}</p>
        <p style="margin:0;">Une question ? <a href="mailto:${SUPPORT_EMAIL}" style="color:${GOLD_INK};">${SUPPORT_EMAIL}</a></p>
      </div>
    </div>
  </div>
</body>
</html>`;
}

export const emailTemplates = {
  welcome(firstName: string) {
    const body = `
      <p style="margin:0 0 16px;">Bonjour <strong>${escapeHtml(firstName)}</strong>,</p>
      <p style="margin:0 0 16px;">Bienvenue sur Gaming Marketplace ! Votre compte a été créé avec succès.</p>
      <p style="margin:0 0 16px;">Vous pouvez maintenant explorer les annonces, acheter ou vendre des comptes de jeux vidéo en toute sécurité.</p>
      ${cta(`${APP_URL}/marketplace`, 'Accéder à la marketplace')}
      <p style="${MUTED_STYLE}">Si vous avez des questions, répondez à cet email ou contactez-nous à ${SUPPORT_EMAIL}</p>
    `;
    return { subject: 'Bienvenue sur Gaming Marketplace', html: wrap('Bienvenue !', body) };
  },

  passwordReset(firstName: string, resetUrl: string) {
    const body = `
      <p style="margin:0 0 16px;">Bonjour <strong>${escapeHtml(firstName)}</strong>,</p>
      <p style="margin:0 0 16px;">Vous avez demandé la réinitialisation de votre mot de passe. Cliquez sur le bouton ci-dessous pour créer un nouveau mot de passe :</p>
      ${cta(resetUrl, 'Réinitialiser mon mot de passe')}
      <p style="${MUTED_STYLE}">Ce lien expire dans 1 heure. Si vous n'avez pas demandé cette réinitialisation, ignorez cet email : votre mot de passe actuel reste valable.</p>
    `;
    return { subject: 'Réinitialisation de votre mot de passe', html: wrap('Mot de passe oublié', body) };
  },

  emailVerification(firstName: string, verifyUrl: string) {
    const body = `
      <p style="margin:0 0 16px;">Bonjour <strong>${escapeHtml(firstName)}</strong>,</p>
      <p style="margin:0 0 16px;">Merci de vous être inscrit sur Gaming Marketplace ! Cliquez sur le bouton ci-dessous pour confirmer votre adresse email :</p>
      ${cta(verifyUrl, 'Confirmer mon email')}
      <p style="${MUTED_STYLE}">Ce lien expire dans 24 heures.</p>
      <div style="${BOX_STYLE}">
        <p style="margin:0 0 8px;color:${TEXT_STRONG};font-size:13px;font-weight:700;">Vous ne trouvez pas cet email ?</p>
        <p style="margin:0;color:${TEXT};font-size:13px;line-height:1.6;">Il se peut qu'il soit classé en courrier indésirable par votre messagerie — c'est un réflexe courant des filtres, notamment sur iPhone. Ajoutez <strong>${SUPPORT_EMAIL}</strong> à vos contacts, puis signalez le message comme « non indésirable » : vos prochains emails arriveront directement dans votre boîte de réception.</p>
      </div>
    `;
    return { subject: 'Confirmez votre email', html: wrap('Confirmation d\'email', body) };
  },

  transactionCreated(params: {
    firstName: string;
    role: 'buyer' | 'seller';
    transactionId: string;
    listingTitle: string;
    amount: number;
    currency: string;
  }) {
    const isBuyer = params.role === 'buyer';
    const firstName = escapeHtml(params.firstName);
    const listingTitle = escapeHtml(params.listingTitle);
    const body = `
      <p style="margin:0 0 16px;">Bonjour <strong>${firstName}</strong>,</p>
      <p style="margin:0 0 16px;">${isBuyer
        ? `Votre commande pour <strong>${listingTitle}</strong> a été créée. Veuillez procéder au paiement pour finaliser.`
        : `Une nouvelle commande a été passée pour votre annonce <strong>${listingTitle}</strong>.`
      }</p>
      <div style="${BOX_STYLE}">
        <p style="${BOX_LABEL_STYLE}">Montant</p>
        <p style="margin:4px 0 0;color:${TEXT_STRONG};font-size:20px;font-weight:700;">${params.amount.toLocaleString('fr-FR')} ${escapeHtml(params.currency)}</p>
      </div>
      <p style="${MUTED_STYLE}">Référence : ${escapeHtml(params.transactionId)}</p>
      ${cta(isBuyer ? BUYER_DASHBOARD_URL : SELLER_DASHBOARD_URL, isBuyer ? 'Accéder à mes achats' : 'Voir mes ventes')}
    `;
    return { subject: isBuyer ? 'Commande créée' : 'Nouvelle commande reçue', html: wrap(isBuyer ? 'Votre commande' : 'Nouvelle vente', body) };
  },

  transactionPaymentConfirmed(params: {
    firstName: string;
    role: 'buyer' | 'seller';
    transactionId: string;
    listingTitle: string;
  }) {
    const isBuyer = params.role === 'buyer';
    const firstName = escapeHtml(params.firstName);
    const listingTitle = escapeHtml(params.listingTitle);
    const body = `
      <p style="margin:0 0 16px;">Bonjour <strong>${firstName}</strong>,</p>
      <p style="margin:0 0 16px;">${isBuyer
        ? `Votre paiement pour <strong>${listingTitle}</strong> a été confirmé. Le vendeur va maintenant vous livrer les accès.`
        : `Le paiement pour la commande <strong>${listingTitle}</strong> a été confirmé. Veuillez livrer les accès du compte.`
      }</p>
      <p style="${MUTED_STYLE}">Référence : ${escapeHtml(params.transactionId)}</p>
      ${cta(isBuyer ? BUYER_DASHBOARD_URL : SELLER_DASHBOARD_URL, isBuyer ? 'Suivre ma commande' : 'Livrer les accès')}
    `;
    return { subject: 'Paiement confirmé', html: wrap('Paiement confirmé', body) };
  },

  transactionPaymentFailed(params: {
    firstName: string;
    transactionId: string;
    listingTitle: string;
  }) {
    const firstName = escapeHtml(params.firstName);
    const listingTitle = escapeHtml(params.listingTitle);
    const body = `
      <p style="margin:0 0 16px;">Bonjour <strong>${firstName}</strong>,</p>
      <p style="margin:0 0 16px;">Le paiement pour <strong>${listingTitle}</strong> n'a pas abouti (annulé ou expiré). Aucun montant n'a été débité.</p>
      <p style="margin:0 0 16px;">Vous pouvez réessayer de commander cette annonce à tout moment.</p>
      <p style="${MUTED_STYLE}">Référence : ${escapeHtml(params.transactionId)}</p>
      ${cta(MARKETPLACE_URL, 'Retourner à la marketplace')}
    `;
    return { subject: 'Paiement non abouti', html: wrap('Paiement non abouti', body) };
  },

  transactionDelivered(params: {
    firstName: string;
    role: 'buyer' | 'seller';
    transactionId: string;
    listingTitle: string;
  }) {
    const isBuyer = params.role === 'buyer';
    const firstName = escapeHtml(params.firstName);
    const listingTitle = escapeHtml(params.listingTitle);
    const body = `
      <p style="margin:0 0 16px;">Bonjour <strong>${firstName}</strong>,</p>
      <p style="margin:0 0 16px;">${isBuyer
        ? `Le vendeur a livré les accès pour <strong>${listingTitle}</strong>. Vous pouvez consulter les accès depuis votre tableau de bord et les vérifier.`
        : `Vous avez livré les accès pour <strong>${listingTitle}</strong>. L'acheteur est en train de vérifier.`
      }</p>
      <p style="${MUTED_STYLE}">Référence : ${escapeHtml(params.transactionId)}</p>
      ${cta(isBuyer ? BUYER_DASHBOARD_URL : SELLER_DASHBOARD_URL, isBuyer ? 'Consulter les accès' : 'Voir ma vente')}
    `;
    return { subject: 'Accès livrés', html: wrap('Livraison effectuée', body) };
  },

  transactionCompleted(params: {
    firstName: string;
    role: 'buyer' | 'seller';
    transactionId: string;
    listingTitle: string;
    amount?: number;
    platformFee?: number;
    sellerAmount?: number;
    currency?: string;
  }) {
    const isBuyer = params.role === 'buyer';
    const firstName = escapeHtml(params.firstName);
    const listingTitle = escapeHtml(params.listingTitle);
    const currency = params.currency ? escapeHtml(params.currency) : '';
    const sellerBreakdown =
      !isBuyer && params.amount != null && params.platformFee != null && params.sellerAmount != null
        ? `
      <div style="${BOX_STYLE}">
        <p style="margin:0 0 8px;color:${GOLD_INK};font-size:13px;font-weight:700;text-transform:uppercase;">Détail du paiement</p>
        <div style="display:flex;justify-content:space-between;align-items:center;margin:4px 0;">
          <span style="color:${TEXT_MUTED};font-size:13px;">Prix de vente</span>
          <span style="color:${TEXT_STRONG};font-size:13px;font-weight:600;">${params.amount.toLocaleString('fr-FR')} ${currency}</span>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;margin:4px 0;">
          <span style="color:${TEXT_MUTED};font-size:13px;">Commission plateforme</span>
          <span style="color:${DANGER};font-size:13px;font-weight:600;">-${params.platformFee.toLocaleString('fr-FR')} ${currency}</span>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;margin:8px 0 0;border-top:1px solid ${BORDER};padding-top:8px;">
          <span style="color:${TEXT_STRONG};font-size:13px;font-weight:700;">Vous recevez</span>
          <span style="color:${SUCCESS};font-size:15px;font-weight:700;">${params.sellerAmount.toLocaleString('fr-FR')} ${currency}</span>
        </div>
      </div>`
        : '';
    const body = `
      <p style="margin:0 0 16px;">Bonjour <strong>${firstName}</strong>,</p>
      <p style="margin:0 0 16px;">${isBuyer
        ? `La transaction pour <strong>${listingTitle}</strong> est terminée. Merci pour votre achat !`
        : `La transaction pour <strong>${listingTitle}</strong> est terminée. Voici le détail de votre paiement :`
      }</p>
      ${sellerBreakdown}
      <p style="${MUTED_STYLE}">Référence : ${escapeHtml(params.transactionId)}</p>
      ${cta(isBuyer ? BUYER_DASHBOARD_URL : SELLER_DASHBOARD_URL, isBuyer ? 'Voir mon historique' : 'Voir ma vente')}
    `;
    return { subject: 'Transaction terminée', html: wrap('Transaction complétée', body) };
  },

  transactionRefunded(params: {
    firstName: string;
    transactionId: string;
    listingTitle: string;
    reason: string;
  }) {
    const firstName = escapeHtml(params.firstName);
    const listingTitle = escapeHtml(params.listingTitle);
    const body = `
      <p style="margin:0 0 16px;">Bonjour <strong>${firstName}</strong>,</p>
      <p style="margin:0 0 16px;">La transaction pour <strong>${listingTitle}</strong> a été remboursée par un administrateur.</p>
      <div style="${BOX_STYLE}">
        <p style="${BOX_LABEL_STYLE}">Raison</p>
        <p style="${BOX_VALUE_STYLE}">${escapeHtml(params.reason)}</p>
      </div>
      <p style="${MUTED_STYLE}">Référence : ${escapeHtml(params.transactionId)}</p>
      ${cta(BUYER_DASHBOARD_URL, 'Voir mes achats')}
    `;
    return { subject: 'Transaction remboursée', html: wrap('Remboursement', body) };
  },

  listingApproved(params: { firstName: string; listingTitle: string }) {
    const firstName = escapeHtml(params.firstName);
    const listingTitle = escapeHtml(params.listingTitle);
    const body = `
      <p style="margin:0 0 16px;">Bonjour <strong>${firstName}</strong>,</p>
      <p style="margin:0 0 16px;">Votre annonce <strong>${listingTitle}</strong> a été approuvée et est désormais visible sur la marketplace.</p>
      ${cta(`${APP_URL}/marketplace`, 'Voir sur la marketplace')}
    `;
    return { subject: 'Annonce approuvée', html: wrap('Annonce publiée', body) };
  },

  listingRejected(params: { firstName: string; listingTitle: string; notes?: string }) {
    const firstName = escapeHtml(params.firstName);
    const listingTitle = escapeHtml(params.listingTitle);
    const notes = params.notes ? escapeHtml(params.notes) : undefined;
    const body = `
      <p style="margin:0 0 16px;">Bonjour <strong>${firstName}</strong>,</p>
      <p style="margin:0 0 16px;">Votre annonce <strong>${listingTitle}</strong> n'a pas été approuvée.</p>
      ${notes ? `
      <div style="${BOX_STYLE}">
        <p style="${BOX_LABEL_STYLE}">Motif</p>
        <p style="${BOX_VALUE_STYLE}">${notes}</p>
      </div>` : ''}
      <p style="${MUTED_STYLE}">Vous pouvez modifier votre annonce et la soumettre à nouveau.</p>
    `;
    return { subject: 'Annonce refusée', html: wrap('Annonce non approuvée', body) };
  },

  listingRemoved(params: { firstName: string; listingTitle: string }) {
    const firstName = escapeHtml(params.firstName);
    const listingTitle = escapeHtml(params.listingTitle);
    const body = `
      <p style="margin:0 0 16px;">Bonjour <strong>${firstName}</strong>,</p>
      <p style="margin:0 0 16px;">Votre annonce <strong>${listingTitle}</strong> a été supprimée par un administrateur et n'est plus disponible sur la marketplace.</p>
      <p style="margin:0 0 16px;">Vous pouvez créer une nouvelle annonce à tout moment si la suppression vous semble être une erreur.</p>
      ${cta(`${APP_URL}/dashboard/seller/listings/new`, 'Créer une annonce')}
    `;
    return { subject: 'Annonce supprimée', html: wrap('Annonce supprimée', body) };
  },

  accountSuspended(params: { firstName: string; reason: string }) {
    const firstName = escapeHtml(params.firstName);
    const body = `
      <p style="margin:0 0 16px;">Bonjour <strong>${firstName}</strong>,</p>
      <p style="margin:0 0 16px;">Votre compte a été suspendu par un administrateur.</p>
      <div style="${BOX_STYLE}">
        <p style="${BOX_LABEL_STYLE}">Raison</p>
        <p style="${BOX_VALUE_STYLE}">${escapeHtml(params.reason)}</p>
      </div>
      <p style="${MUTED_STYLE}">Si vous pensez qu'il s'agit d'une erreur, contactez ${SUPPORT_EMAIL}</p>
    `;
    return { subject: 'Compte suspendu', html: wrap('Compte suspendu', body) };
  },

  accountBanned(params: { firstName: string; reason: string }) {
    const firstName = escapeHtml(params.firstName);
    const body = `
      <p style="margin:0 0 16px;">Bonjour <strong>${firstName}</strong>,</p>
      <p style="margin:0 0 16px;">Votre compte a été définitivement fermé par un administrateur.</p>
      <div style="${BOX_STYLE}">
        <p style="${BOX_LABEL_STYLE}">Raison</p>
        <p style="${BOX_VALUE_STYLE}">${escapeHtml(params.reason)}</p>
      </div>
    `;
    return { subject: 'Compte fermé', html: wrap('Compte fermé', body) };
  },

  disputeOpened(params: {
    firstName: string;
    role: 'buyer' | 'seller';
    transactionId: string;
    reason: string;
  }) {
    const firstName = escapeHtml(params.firstName);
    const isBuyer = params.role === 'buyer';
    const body = `
      <p style="margin:0 0 16px;">Bonjour <strong>${firstName}</strong>,</p>
      <p style="margin:0 0 16px;">${
        isBuyer
          ? 'Vous avez ouvert un litige sur votre transaction. Notre équipe examine votre dossier.'
          : 'Un litige a été ouvert par un acheteur sur une de vos ventes. Le montant reste bloqué tant que notre équipe n\'a pas examiné le dossier.'
      }</p>
      <div style="${BOX_STYLE}">
        <p style="${BOX_LABEL_STYLE}">Motif</p>
        <p style="${BOX_VALUE_STYLE}">${escapeHtml(params.reason)}</p>
      </div>
      <p style="${MUTED_STYLE}">Référence : ${escapeHtml(params.transactionId)}</p>
      ${cta(isBuyer ? BUYER_DASHBOARD_URL : SELLER_DASHBOARD_URL, isBuyer ? 'Suivre mon litige' : 'Voir mes ventes')}
      ${
        isBuyer
          ? ''
          : `<p style="${MUTED_STYLE}">Si vous pensez que le litige est infondé, répondez dans la messagerie de la transaction avec vos arguments.</p>`
      }
    `;
    return { subject: 'Litige ouvert', html: wrap('Litige ouvert', body) };
  },

  disputeResolved(params: {
    firstName: string;
    role: 'buyer' | 'seller';
    outcome: 'BUYER' | 'SELLER';
    transactionId: string;
    resolution: string;
  }) {
    const firstName = escapeHtml(params.firstName);
    const body = `
      <p style="margin:0 0 16px;">Bonjour <strong>${firstName}</strong>,</p>
      <p style="margin:0 0 16px;">Le litige pour la transaction <strong>${escapeHtml(params.transactionId)}</strong> a été résolu.</p>
      <div style="${BOX_STYLE}">
        <p style="${BOX_LABEL_STYLE}">Décision</p>
        <p style="${BOX_VALUE_STYLE}">${
          params.outcome === 'BUYER'
            ? 'Remboursement de l\'acheteur — vous êtes remboursé de la totalité du montant.'
            : 'Paiement au vendeur — la vente est validée et le vendeur est payé.'
        }</p>
      </div>
      <div style="${BOX_STYLE}">
        <p style="${BOX_LABEL_STYLE}">Motif de la décision</p>
        <p style="${BOX_VALUE_STYLE}">${escapeHtml(params.resolution)}</p>
      </div>
      ${cta(params.role === 'buyer' ? BUYER_DASHBOARD_URL : SELLER_DASHBOARD_URL, 'Voir mes transactions')}
    `;
    return { subject: 'Litige résolu', html: wrap('Litige résolu', body) };
  },

  sellerStatusChanged(params: { firstName: string; status: string }) {
    const isApproved = params.status === 'VERIFIED';
    const firstName = escapeHtml(params.firstName);
    const body = `
      <p style="margin:0 0 16px;">Bonjour <strong>${firstName}</strong>,</p>
      <p style="margin:0 0 16px;">${isApproved
        ? 'Félicitations ! Votre compte vendeur a été vérifié. Vous pouvez désormais publier des annonces.'
        : 'Votre demande de vérification vendeur a été rejetée. Vous pouvez soumettre une nouvelle demande.'
      }</p>
      ${isApproved ? cta(`${APP_URL}/dashboard/seller/listings/new`, 'Publier une annonce') : ''}
    `;
    return { subject: isApproved ? 'Compte vendeur vérifié' : 'Demande vendeur rejetée', html: wrap(isApproved ? 'Vendeur vérifié' : 'Demande vendeur', body) };
  },
};
