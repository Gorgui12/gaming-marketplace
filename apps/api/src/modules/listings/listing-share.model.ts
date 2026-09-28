import { Schema, model, type InferSchemaType } from 'mongoose';

/**
 * Journal des partages d'annonce — sert uniquement à la déduplication.
 *
 * Pourquoi une collection plutôt qu'un tableau `sharedSessions` sur l'annonce :
 * ce tableau serait borné par la taille maximale d'un document Mongo (16 Mo) et
 * par `findOneAndUpdate` qui réécrit le document entier à chaque partage. Sur
 * une annonce populaire, la collection grossit mais chaque écriture reste
 * ponctuelle, et le TTL vide les documents sans coût de migration.
 *
 * Pourquoi un TTL de 90 jours : c'est exactement la durée de vie du cookie
 * `gm_track_sid` (`apps/web/lib/tracking-session.ts`). Les deux fenêtres
 * coïncident, donc « une session, un partage » tient sans configuration
 * supplémentaire — et une session qui revient après 90 jours repart avec un
 * nouveau cookie, donc un nouveau comptage, ce qui est le comportement voulu.
 */
const listingShareSchema = new Schema(
  {
    listing: { type: Schema.Types.ObjectId, ref: 'Listing', required: true },

    /**
     * Identifiant anonyme de session (cookie `gm_track_sid`).
     *
     * Volontairement pas l'identifiant utilisateur : un même vendeur qui
     * partage son annonce depuis son téléphone et son ordinateur doit compter
     * deux fois, et un partage anonyme doit compter aussi. Compter « par
     * utilisateur » rendrait le chiffre illisible — il plafonnerait à 1 par
     * vendeur, ce qui est précisément la métrique qu'on veut mesurer.
     */
    sessionId: { type: String, required: true },

    /** Canal utilisé, pour comprendre d'où viennent les partages. */
    channel: {
      type: String,
      enum: ['whatsapp', 'facebook', 'native', 'copy'],
      required: true,
    },

    /** Renseigné si le partage vient d'un compte connecté (analyse). */
    user: { type: Schema.Types.ObjectId, ref: 'User' },

    /** Pilote l'index TTL : le document est supprimé 90 jours après. */
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true },
);

// Mécanisme de déduplication : l'insertion du deuxième partage d'une même
// session sur la même annonce viole cet index, et le service translate ce
// E11000 en « déjà compté » au lieu d'incrémenter.
listingShareSchema.index({ listing: 1, sessionId: 1 }, { unique: true });

// Purge automatique par MongoDB, environ toutes les 60 s.
listingShareSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export type ListingShareDocument = InferSchemaType<typeof listingShareSchema>;
export const ListingShareModel = model('ListingShare', listingShareSchema);
