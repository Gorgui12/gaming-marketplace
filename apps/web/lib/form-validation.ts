import type { ZodType } from 'zod';

export type FieldErrors = Record<string, string>;

/**
 * Validation côté client avec les MÊMES schémas Zod que le serveur
 * (@gm/validation) — une seule source de vérité : impossible que le
 * formulaire et l'API divergent.
 * Retourne soit les données parsées, soit une map champ -> 1er message
 * d'erreur, prête à être affichée sous chaque input.
 */
export function validateForm<T>(
  schema: ZodType<T>,
  values: unknown,
): { data: T; errors: null } | { data: null; errors: FieldErrors } {
  const result = schema.safeParse(values);
  if (result.success) {
    return { data: result.data, errors: null };
  }

  const flat = result.error.flatten() as {
    fieldErrors: Record<string, string[] | undefined>;
    formErrors: string[];
  };
  const errors: FieldErrors = {};
  for (const [field, messages] of Object.entries(flat.fieldErrors)) {
    if (messages && messages.length > 0) {
      errors[field] = messages[0]!;
    }
  }
  if (flat.formErrors.length > 0) {
    errors._form = flat.formErrors.join(' · ');
  }
  return { data: null, errors };
}
