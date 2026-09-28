import { z } from 'zod';

// Mise à jour du profil de l'utilisateur connecté (page /profile).
// phone et avatar acceptent une chaîne vide pour effacer la valeur.
export const updateProfileSchema = z.object({
  firstName: z.string().min(1).max(80).optional(),
  lastName: z.string().min(1).max(80).optional(),
  phone: z
    .union([z.literal(''), z.string().min(8).max(20)])
    .optional(),
  avatar: z
    .union([z.literal(''), z.string().url('URL invalide').max(500)])
    .optional(),
  country: z.string().length(2).optional(),
  currency: z.string().length(3).optional(),
  // Bascule du consentement à la newsletter depuis la page préférences.
  //
  // `optional()` (et non `.default(false)` contrairement à l'inscription) :
  // ici un champ absent signifie « ne change rien ». Avec un défaut, un PUT
  // du profil qui n’envoyerait que le nom désinscrirait silencieusement tout
  // le monde.
  marketingOptIn: z.boolean().optional(),
});
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;