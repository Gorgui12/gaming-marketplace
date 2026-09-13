export interface ListingFilters {
  game?: string | undefined;
  sort?: string | undefined;
  minPrice?: string | undefined;
  maxPrice?: string | undefined;
}

// Construit le chemin API à partir des filtres de l'URL. Les annonces ne sont
// montrées que par la recherche backend (crow / sort / prix), jamais filtrées
// côté client, pour garder des URLs partageables et un rendu serveur.
export function buildListingsPath(base: string, filters: ListingFilters): string {
  const search = new URLSearchParams();
  if (filters.game) search.set('game', filters.game);
  if (filters.sort && filters.sort !== 'recent') search.set('sort', filters.sort);
  if (filters.minPrice) search.set('minPrice', filters.minPrice);
  if (filters.maxPrice) search.set('maxPrice', filters.maxPrice);
  const qs = search.toString();
  return qs ? `${base}?${qs}` : base;
}