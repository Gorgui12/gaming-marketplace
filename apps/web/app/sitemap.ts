import type { MetadataRoute } from 'next';
import { apiFetch } from '@/lib/api-client';
import type { Listing, Paginated } from '@gm/types';

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticEntries: MetadataRoute.Sitemap = [
    { url: BASE_URL, changeFrequency: 'daily', priority: 1 },
    { url: `${BASE_URL}/marketplace`, changeFrequency: 'hourly', priority: 0.9 },
    { url: `${BASE_URL}/marketplace/efootball`, changeFrequency: 'hourly', priority: 0.9 },
    { url: `${BASE_URL}/marketplace/efootball/senegal`, changeFrequency: 'hourly', priority: 0.95 },
    { url: `${BASE_URL}/affiliate`, changeFrequency: 'weekly', priority: 0.5 },
  ];

  let listingEntries: MetadataRoute.Sitemap = [];
  try {
    const result = await apiFetch<Paginated<Listing>>('/api/v1/listings?pageSize=50');
    listingEntries = result.items.map((listing) => ({
      url: `${BASE_URL}/marketplace/efootball/${listing.slug}`,
      changeFrequency: 'daily' as const,
      priority: 0.7,
    }));
  } catch {
    // API indisponible au moment de la génération — le sitemap reste
    // valide avec uniquement les pages statiques plutôt que d'échouer.
  }

  return [...staticEntries, ...listingEntries];
}
