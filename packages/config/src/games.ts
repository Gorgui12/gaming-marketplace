import { GameTermsStatus } from '@gm/types';

export interface GameSeedConfig {
  slug: string;
  name: string;
  active: boolean;
  marketplaceEnabled: boolean;
  termsStatus: GameTermsStatus;
  termsNotes?: string;
}

/**
 * Registre de seed initial. La source de vérité en runtime reste la
 * collection MongoDB `games` (modifiable par un admin) — ce fichier ne sert
 * qu'à initialiser/seeder l'environnement de développement.
 *
 * IMPORTANT: termsStatus = UNREVIEWED par défaut. Ne jamais activer
 * marketplaceEnabled=true sans revue explicite (voir docs/SECURITY.md).
 */
export const GAMES_SEED: GameSeedConfig[] = [
  {
    slug: 'efootball',
    name: 'eFootball',
    active: true,
    marketplaceEnabled: false, // à activer manuellement après revue CGU Konami
    termsStatus: GameTermsStatus.UNREVIEWED,
    termsNotes:
      'Revue CGU Konami requise avant activation commerciale. Voir docs/SECURITY.md §CGU.',
  },
];
