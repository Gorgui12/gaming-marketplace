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

const BASE_STYLE = `
  margin: 0; padding: 0; box-sizing: border-box;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
`;

const CONTAINER_STYLE = `
  max-width: 600px; margin: 0 auto; background: #0f172a;
  border-radius: 12px; overflow: hidden;
`;

const HEADER_STYLE = `
  background: linear-gradient(135deg, #d4af37 0%, #b8962e 100%);
  padding: 32px 24px; text-align: center;
`;

const BODY_STYLE = `
  padding: 32px 24px; color: #e2e8f0;
`;

const BUTTON_STYLE = `
  display: inline-block; background: #d4af37; color: #0f172a;
  text-decoration: none; padding: 14px 32px; border-radius: 999px;
  font-weight: 600; font-size: 14px; margin: 16px 0;
`;

const FOOTER_STYLE = `
  padding: 24px; text-align: center; color: #64748b; font-size: 12px;
  border-top: 1px solid #1e293b;
`;

function wrap(title: string, bodyHtml: string): string {
  return `<!DOCTYPE html>
<html lang="fr">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="${BASE_STYLE}">
  <div style="padding:24px;background:#020617;">
    <div style="${CONTAINER_STYLE}">
      <div style="${HEADER_STYLE}">
        <h1 style="margin:0;font-size:24px;color:#0f172a;">Gaming Marketplace</h1>
      </div>
      <div style="${BODY_STYLE}">
        <h2 style="margin:0 0 16px;color:#d4af37;font-size:20px;">${title}</h2>
        ${bodyHtml}
      </div>
      <div style="${FOOTER_STYLE}">
        <p>Gaming Marketplace &mdash; Le marketplace du gaming</p>
        <p>support@gamingmarket.store</p>
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
      <div style="text-align:center;margin:24px 0;">
        <a href="${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/marketplace" style="${BUTTON_STYLE}">Accéder à la marketplace</a>
      </div>
      <p style="margin:0;color:#94a3b8;font-size:13px;">Si vous avez des questions, répondez à cet email ou contactez-nous à support@gamingmarket.store</p>
    `;
    return { subject: 'Bienvenue sur Gaming Marketplace', html: wrap('Bienvenue !', body) };
  },

  passwordReset(firstName: string, resetUrl: string) {
    const body = `
      <p style="margin:0 0 16px;">Bonjour <strong>${escapeHtml(firstName)}</strong>,</p>
      <p style="margin:0 0 16px;">Vous avez demandé la réinitialisation de votre mot de passe. Cliquez sur le bouton ci-dessous pour créer un nouveau mot de passe :</p>
      <div style="text-align:center;margin:24px 0;">
        <a href="${resetUrl}" style="${BUTTON_STYLE}">Réinitialiser mon mot de passe</a>
      </div>
      <p style="margin:0 0 16px;color:#94a3b8;font-size:13px;">Ce lien expire dans 1 heure. Si vous n'avez pas demandé cette réinitialisation, ignorez cet email.</p>
    `;
    return { subject: 'Réinitialisation de votre mot de passe', html: wrap('Mot de passe oublié', body) };
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
      <div style="background:#1e293b;padding:16px;border-radius:8px;margin:16px 0;">
        <p style="margin:0;color:#94a3b8;font-size:13px;">Montant</p>
        <p style="margin:4px 0 0;color:#d4af37;font-size:20px;font-weight:700;">${params.amount.toLocaleString('fr-FR')} ${escapeHtml(params.currency)}</p>
      </div>
      <p style="margin:0;color:#94a3b8;font-size:13px;">Référence : ${escapeHtml(params.transactionId)}</p>
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
      <p style="margin:0;color:#94a3b8;font-size:13px;">Référence : ${escapeHtml(params.transactionId)}</p>
    `;
    return { subject: 'Paiement confirmé', html: wrap('Paiement confirmé', body) };
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
      <p style="margin:0;color:#94a3b8;font-size:13px;">Référence : ${escapeHtml(params.transactionId)}</p>
    `;
    return { subject: 'Accès livrés', html: wrap('Livraison effectuée', body) };
  },

  transactionCompleted(params: {
    firstName: string;
    role: 'buyer' | 'seller';
    transactionId: string;
    listingTitle: string;
    sellerAmount?: number;
    currency?: string;
  }) {
    const isBuyer = params.role === 'buyer';
    const firstName = escapeHtml(params.firstName);
    const listingTitle = escapeHtml(params.listingTitle);
    const currency = params.currency ? escapeHtml(params.currency) : '';
    const body = `
      <p style="margin:0 0 16px;">Bonjour <strong>${firstName}</strong>,</p>
      <p style="margin:0 0 16px;">${isBuyer
        ? `La transaction pour <strong>${listingTitle}</strong> est terminée. Merci pour votre achat !`
        : `La transaction pour <strong>${listingTitle}</strong> est terminée. ${params.sellerAmount ? `Vous recevrez <strong>${params.sellerAmount.toLocaleString('fr-FR')} ${currency}</strong> prochainement.` : ''}`
      }</p>
      <p style="margin:0;color:#94a3b8;font-size:13px;">Référence : ${escapeHtml(params.transactionId)}</p>
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
      <div style="background:#1e293b;padding:16px;border-radius:8px;margin:16px 0;">
        <p style="margin:0;color:#94a3b8;font-size:13px;">Raison</p>
        <p style="margin:4px 0 0;color:#e2e8f0;">${escapeHtml(params.reason)}</p>
      </div>
      <p style="margin:0;color:#94a3b8;font-size:13px;">Référence : ${escapeHtml(params.transactionId)}</p>
    `;
    return { subject: 'Transaction remboursée', html: wrap('Remboursement', body) };
  },

  listingApproved(params: { firstName: string; listingTitle: string }) {
    const firstName = escapeHtml(params.firstName);
    const listingTitle = escapeHtml(params.listingTitle);
    const body = `
      <p style="margin:0 0 16px;">Bonjour <strong>${firstName}</strong>,</p>
      <p style="margin:0 0 16px;">Votre annonce <strong>${listingTitle}</strong> a été approuvée et est désormais visible sur la marketplace.</p>
      <div style="text-align:center;margin:24px 0;">
        <a href="${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/marketplace" style="${BUTTON_STYLE}">Voir sur la marketplace</a>
      </div>
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
      <div style="background:#1e293b;padding:16px;border-radius:8px;margin:16px 0;">
        <p style="margin:0;color:#94a3b8;font-size:13px;">Motif</p>
        <p style="margin:4px 0 0;color:#e2e8f0;">${notes}</p>
      </div>` : ''}
      <p style="margin:0;color:#94a3b8;font-size:13px;">Vous pouvez modifier votre annonce et la soumettre à nouveau.</p>
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
      <div style="text-align:center;margin:24px 0;">
        <a href="${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/dashboard/seller/listings/new" style="${BUTTON_STYLE}">Créer une annonce</a>
      </div>
    `;
    return { subject: 'Annonce supprimée', html: wrap('Annonce supprimée', body) };
  },

  accountSuspended(params: { firstName: string; reason: string }) {
    const firstName = escapeHtml(params.firstName);
    const body = `
      <p style="margin:0 0 16px;">Bonjour <strong>${firstName}</strong>,</p>
      <p style="margin:0 0 16px;">Votre compte a été suspendu par un administrateur.</p>
      <div style="background:#1e293b;padding:16px;border-radius:8px;margin:16px 0;">
        <p style="margin:0;color:#94a3b8;font-size:13px;">Raison</p>
        <p style="margin:4px 0 0;color:#e2e8f0;">${escapeHtml(params.reason)}</p>
      </div>
      <p style="margin:0;color:#94a3b8;font-size:13px;">Si vous pensez qu'il s'agit d'une erreur, contactez support@gamingmarket.store</p>
    `;
    return { subject: 'Compte suspendu', html: wrap('Compte suspendu', body) };
  },

  accountBanned(params: { firstName: string; reason: string }) {
    const firstName = escapeHtml(params.firstName);
    const body = `
      <p style="margin:0 0 16px;">Bonjour <strong>${firstName}</strong>,</p>
      <p style="margin:0 0 16px;">Votre compte a été définitivement fermé par un administrateur.</p>
      <div style="background:#1e293b;padding:16px;border-radius:8px;margin:16px 0;">
        <p style="margin:0;color:#94a3b8;font-size:13px;">Raison</p>
        <p style="margin:4px 0 0;color:#e2e8f0;">${escapeHtml(params.reason)}</p>
      </div>
    `;
    return { subject: 'Compte fermé', html: wrap('Compte fermé', body) };
  },

  disputeResolved(params: {
    firstName: string;
    role: 'buyer' | 'seller';
    transactionId: string;
    resolution: string;
  }) {
    const firstName = escapeHtml(params.firstName);
    const body = `
      <p style="margin:0 0 16px;">Bonjour <strong>${firstName}</strong>,</p>
      <p style="margin:0 0 16px;">Le litige pour la transaction <strong>${escapeHtml(params.transactionId)}</strong> a été résolu.</p>
      <div style="background:#1e293b;padding:16px;border-radius:8px;margin:16px 0;">
        <p style="margin:0;color:#94a3b8;font-size:13px;">Décision</p>
        <p style="margin:4px 0 0;color:#e2e8f0;">${escapeHtml(params.resolution)}</p>
      </div>
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
      ${isApproved ? `
      <div style="text-align:center;margin:24px 0;">
        <a href="${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/dashboard/seller/listings/new" style="${BUTTON_STYLE}">Publier une annonce</a>
      </div>` : ''}
    `;
    return { subject: isApproved ? 'Compte vendeur vérifié' : 'Demande vendeur rejetée', html: wrap(isApproved ? 'Vendeur vérifié' : 'Demande vendeur', body) };
  },
};
