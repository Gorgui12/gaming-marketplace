export interface CountryConfig {
  code: string; // ISO 3166-1 alpha-2
  name: string;
  currency: string; // ISO 4217
  phonePrefix: string;
  launched: boolean; // marché activé sur la marketplace
}

/**
 * Registre central des pays supportés.
 * Ne JAMAIS supposer qu'une devise est partagée entre deux pays sans le
 * vérifier explicitement ici — deux pays UEMOA partagent le XOF, mais ce
 * n'est pas vrai pour tous les voisins (ex: Guinée = GNF, Nigeria = NGN).
 */
export const COUNTRIES: Record<string, CountryConfig> = {
  SN: { code: 'SN', name: 'Sénégal', currency: 'XOF', phonePrefix: '+221', launched: true },
  CI: { code: 'CI', name: "Côte d'Ivoire", currency: 'XOF', phonePrefix: '+225', launched: false },
  ML: { code: 'ML', name: 'Mali', currency: 'XOF', phonePrefix: '+223', launched: false },
  GN: { code: 'GN', name: 'Guinée', currency: 'GNF', phonePrefix: '+224', launched: false },
  NG: { code: 'NG', name: 'Nigeria', currency: 'NGN', phonePrefix: '+234', launched: false },
  GH: { code: 'GH', name: 'Ghana', currency: 'GHS', phonePrefix: '+233', launched: false },
};

export function getCountry(code: string): CountryConfig | undefined {
  return COUNTRIES[code.toUpperCase()];
}

export function getLaunchedCountries(): CountryConfig[] {
  return Object.values(COUNTRIES).filter((c) => c.launched);
}
