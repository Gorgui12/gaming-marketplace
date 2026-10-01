import { Schema, model, type InferSchemaType } from 'mongoose';

/**
 * Historique des envois d'emails rédigés depuis le back-office.
 *
 * Le HTML est conservé. C'est ce qui distingue cet historique de celui de la
 * newsletter : un envoi raté ou contesté n'est interpretable que si l'on peut
 * relire le message exact qui est parti, et un « de quoi se plaignait le
 * destinataire » sans le corps n'a pas de réponse. Le coût est un document
 * plus lourd par envoi, ce qui reste negligeable à l'échelle d'un envoi
 * manuel.
 */
const adminEmailSendSchema = new Schema(
  {
    /** Objet tel qu'il a été envoyé. */
    subject: { type: String, required: true },

    /**
     * `COMMERCIAL` : sollicitation, filtrée sur le consentement marketing et
     * accompagnée des en-têtes RFC 8058 de désinscription.
     *
     * `TRANSACTIONAL` : message lié au compte (maintenance, litige, info
     * produit), sans filtre marketing ni lien de désinscription.
     *
     * La distinction n'est pas cosmétique : c'est ce qui décide si l'envoi
     * est licite et s'il porte `List-Unsubscribe`. Elle est figée à l'envoi
     * pour que l'historique dise ce qui a réellement été fait, y compris si
     * la loi a changé depuis.
     */
    kind: {
      type: String,
      enum: ['COMMERCIAL', 'TRANSACTIONAL'],
      required: true,
    },

    /** Corps HTML après désinfection, tel qu'il a été interpolé. */
    html: { type: String, required: true },

    /** Corps d'origine, avant désinfection — pour comprendre ce qui a été retiré. */
    rawHtml: { type: String, default: null },

    /**
     * `RUNNING` existe parce que l'envoi est asynchrone : la route répond 202
     * et le travail continue. Un document reste donc visible en `RUNNING`
     * pendant toute la durée, ce qui est l'état normal et pas une anomalie.
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
     * « admin:web » — trace l'auteur de l'envoi, comme le fait la newsletter
     * pour distinguer un humain d'un cron. On ne conserve pas l'_id nu : le
     * format `admin:web` est celui qu'attend déjà l'historique existant, donc
     * une future lecture croisée des deux historiques reste lisible.
     */
    initiatedBy: { type: String, required: true },

    /** Message de la première erreur, tronqué comme dans la newsletter. */
    lastError: { type: String, default: null },
  },
  { timestamps: true },
);

adminEmailSendSchema.index({ createdAt: -1 });

export type AdminEmailSendDocument = InferSchemaType<typeof adminEmailSendSchema>;
export const AdminEmailSendModel = model('AdminEmailSend', adminEmailSendSchema);
