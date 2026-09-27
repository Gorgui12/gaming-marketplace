import { z } from 'zod';
import { emailFieldSchema } from './email.js';

export const registerSchema = z.object({
  // Champ partagé avec le formulaire web : rejette les adresses qui ne
  // peuvent pas fonctionner (domaine jetable, TLD réservé) avant même
  // d'atteindre la base. La délivrabilité réelle est vérifiée par l'API.
  email: emailFieldSchema,
  phone: z.string().min(8).max(20).optional(),
  password: z
    .string()
    .min(10, 'Le mot de passe doit contenir au moins 10 caractères')
    .regex(/[A-Z]/, 'Doit contenir au moins une majuscule')
    .regex(/[0-9]/, 'Doit contenir au moins un chiffre'),
  firstName: z.string().min(1).max(80),
  lastName: z.string().min(1).max(80),
  username: z
    .string()
    .min(3)
    .max(30)
    .regex(/^[a-z0-9_]+$/, 'Lettres minuscules, chiffres et underscore uniquement'),
  country: z.string().length(2),
  // Optionnel: sessionId de tracking affilié, pour rattacher une
  // attribution existante au compte fraîchement créé (§9).
  sessionId: z.string().optional(),
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const forgotPasswordSchema = z.object({
  email: z.string().email(),
});
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z.object({
  token: z.string().min(1),
  password: z
    .string()
    .min(10, 'Le mot de passe doit contenir au moins 10 caractères')
    .regex(/[A-Z]/, 'Doit contenir au moins une majuscule')
    .regex(/[0-9]/, 'Doit contenir au moins un chiffre'),
});
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

export const googleAuthSchema = z.object({
  idToken: z.string().min(1),
  country: z.string().length(2).optional(),
  sessionId: z.string().optional(),
});
export type GoogleAuthInput = z.infer<typeof googleAuthSchema>;

export const verifyEmailSchema = z.object({
  token: z.string().min(1, 'Token manquant'),
});
export type VerifyEmailInput = z.infer<typeof verifyEmailSchema>;

/**
 * Demande de renvoi du lien de confirmation.
 *
 * `email` est facultatif : lorsqu'une session est ouverte, l'API retrouve le
 * compte tout seul. C'est le cas d'usage principal (l'utilisateur vient de
 * s'inscrire ou de se connecter) et cela évite de faire circuler son adresse
 * dans l'URL de la page. Le champ reste accepté pour le cas où la session a
 * été perdue — l'API renvoie alors toujours la même réponse.
 */
export const resendVerificationSchema = z.object({
  email: z.string().email().optional(),
});
export type ResendVerificationInput = z.infer<typeof resendVerificationSchema>;

/**
 * Analyse d'un email AVANT l'inscription. Volontairement sans contrainte de
 * format : c'est précisément le rôle de cette route que de diagnostiquer une
 * adresse mal formée au lieu de la rejeter bêtement. Aucun accès à la base —
 * donc aucun risque d'énumération de comptes.
 */
export const checkEmailSchema = z.object({
  email: z.string().min(1, 'Email manquant').max(320),
});
export type CheckEmailInput = z.infer<typeof checkEmailSchema>;
