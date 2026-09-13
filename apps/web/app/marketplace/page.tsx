import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { SiteNav } from '@/components/site-nav';
import { SiteFooter } from '@/components/site-footer';
import { ListingCard } from '@/components/listing-card';
import { ListingFilters } from '@/components/listing-filters';
import { apiFetch } from '@/lib/api-client';
import { buildListingsPath } from '@/lib/listings-query';
import type { Listing, Paginated } from '@gm/types';

export const revalidate = 60;

type MarketplaceSearchParams = Record<string, string | undefined>;

export const metadata: Metadata = {
  title: 'Marketplace',
  description: 'Tous les comptes gaming vérifiés disponibles à l\'achat.',
};

async function getListings(
  params: MarketplaceSearchParams,
): Promise<Paginated<Listing> | null> {
  try {
    return await apiFetch<Paginated<Listing>>(buildListingsPath('/api/v1/listings', params));
  } catch {
    return null;
  }
}

export default async function MarketplacePage({
  searchParams,
}: {
  searchParams: Promise<MarketplaceSearchParams>;
}) {
  const params = await searchParams;
  const result = await getListings(params);
  const hasFilters = Boolean(
    (params.sort && params.sort !== 'recent') || params.minPrice || params.maxPrice,
  );

  return (
    <>
      <SiteNav />
      <main className="mx-auto max-w-6xl px-5 py-12">
        <h1 className="font-display text-3xl text-bone">Marketplace</h1>
        <p className="mt-2 text-bone/60">Comptes gaming vérifiés, remis en toute sécurité.</p>

        {!result || result.items.length === 0 ? (
          <div className="mt-10 rounded-ticket border border-white/10 bg-navy-mid p-10 text-center">
            <p className="font-display text-lg text-bone">
              {hasFilters
                ? 'Aucune annonce ne correspond à vos filtres'
                : 'Aucune annonce disponible'}
            </p>
            <p className="mt-2 text-sm text-bone/60">
              {hasFilters
                ? 'Essayez d’élargir vos critères de recherche.'
                : 'Le catalogue se remplit dès les premières annonces publiées par nos vendeurs.'}
            </p>
            {!hasFilters ? (
              <Link
                href="/affiliate"
                className="mt-6 inline-block rounded-full border border-white/15 px-5 py-2.5 text-sm text-bone hover:border-white/30"
              >
                Découvrir le programme d&apos;affiliation
              </Link>
            ) : null}
          </div>
        ) : (
          <>
            <Suspense
              fallback={
                <div className="mt-8 h-16 animate-pulse rounded-ticket border border-white/10 bg-navy-mid" />
              }
            >
              <ListingFilters />
            </Suspense>
            <div className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {result.items.map((listing) => (
                <ListingCard key={listing._id} listing={listing} />
              ))}
            </div>
          </>
        )}
      </main>
      <SiteFooter />
    </>
  );
}
