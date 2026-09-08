export interface AffiliateTierSeedConfig {
  name: string;
  slug: string;
  defaultCommissionRate: number;
  minConversionsToUpgrade?: number;
}

/**
 * Programme d'affiliation à quatre niveaux. Taux appliqués sur le montant
 * net du vendeur (§11) et soutirés sur la commission plateforme.
 *
 * Registre de seed initial — la source de vérité runtime reste la
 * collection MongoDB `affiliatetiers` (modifiable par un admin).
 */
export const AFFILIATE_TIERS_SEED: AffiliateTierSeedConfig[] = [
  {
    name: 'Débutant',
    slug: 'starter',
    defaultCommissionRate: 0.03, // 3%
    minConversionsToUpgrade: 0,
  },
  {
    name: 'Confirmé',
    slug: 'bronze',
    defaultCommissionRate: 0.05, // 5%
    minConversionsToUpgrade: 10,
  },
  {
    name: 'Avancé',
    slug: 'silver',
    defaultCommissionRate: 0.07, // 7%
    minConversionsToUpgrade: 50,
  },
  {
    name: 'Expert',
    slug: 'gold',
    defaultCommissionRate: 0.09, // 9%
    minConversionsToUpgrade: 150,
  },
];

/** Taux par défaut appliqué à une nouvelle candidature (niveau 1). */
export const DEFAULT_STARTER_COMMISSION_RATE = 0.03;
