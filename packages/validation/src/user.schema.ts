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
});
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;