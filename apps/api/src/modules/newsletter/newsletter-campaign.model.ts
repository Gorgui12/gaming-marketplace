import { Schema, model, type InferSchemaType } from 'mongoose';

const newsletterCampaignSchema = new Schema(
  {
    /**
     * Identifiant de la periode d'envoi, unique.
     *
     * C'est tout le mecanisme d'idempotence du systeme. Un cron externe peut
     * se declencher deux fois (rejeu du service de cron, redemarrage, double
     * configuration) : le deuxieme essai se heurte a la cle unique et ne
     * renvoie rien, au lieu d'envoyer la newsletter deux fois a toute la
     * liste. Sans ca, un simple doublon de configuration cron produirait la
     * premiere vraie plainte spam de la plateforme.
     *
     * Format : `YYYY-Www-j` ou `j` est le jour ISO de la semaine (1 = lundi,
     * 7 = dimanche). Derivee de la date d'envoi, donc deux envois dans la meme
     * semaine ont deux cles differentes (les deux envois hebdomadaires) et un
     * rejeu le meme jour a la meme cle.
     */
    key: { type: String, required: true, unique: true },

    /** Periode de « fraicheur » couverte par la selection. */
    periodStart: { type: Date, required: true },
    periodEnd: { type: Date, required: true },

    /**
     * Annonces effectivement mises en avant.
     *
     * Sert a deux choses : l'historique lisible par l'admin, et l'exclusion
     * des annonces deja presentees lors d'un envoi recent. Sans cet historique
     * en base, une annonce qui reste populaire se retrouve dans les DEUX
     * emails de la semaine — le lecteur la recoit deux fois en sept jours,
     * ce qui est le meilleur moyen de se faire desabonner.
     */
    listingIds: { type: [Schema.Types.ObjectId], ref: 'Listing', default: [] },

    /**
     * Statut de l'envoi.
     *
     * `PARTIAL` existe parce que la realite d'un envoi de masse est
     * intermediaire : quelques adresses en erreur n'annulent pas la campagne,
     * mais les declarer `COMPLETED` sans signaler que 30 envois sur 400 ont
     * echoue donnerait une|delivrabilite impeccable dans l'historique.
     */
    status: {
      type: String,
      enum: ['RUNNING', 'COMPLETED', 'PARTIAL', 'FAILED'],
      default: 'RUNNING',
    },

    recipientCount: { type: Number, default: 0 },
    successCount: { type: Number, default: 0 },
    failureCount: { type: Number, default: 0 },

    /**
     * « admin:web » ou « cron:external ».
     *
     * Distingue un envoi declenche par un humain d'un envoi automatique : si
     * un envoi commercial part sans que personne ne l'ait voulu, il faut le
     * voir immediatement dans l'historique.
     */
    initiatedBy: { type: String, required: true },

    /** Message de la premiere erreur d'envoi, tronque. */
    lastError: { type: String, default: null },
  },
  { timestamps: true },
);

export type NewsletterCampaignDocument = InferSchemaType<typeof newsletterCampaignSchema>;
export const NewsletterCampaignModel = model('NewsletterCampaign', newsletterCampaignSchema);
