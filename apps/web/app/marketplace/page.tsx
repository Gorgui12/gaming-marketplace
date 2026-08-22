import type { Metadata } from 'next';
import Link from 'next/link';
import { SiteNav } from '@/components/site-nav';
import { SiteFooter } from '@/components/site-footer';
import { ListingCard } from '@/components/listing-card';
import { apiFetch } from '@/lib/api-client';
import type { Listing, Paginated } from '@gm/types';

export const revalidate = 60;

export const metadata: Metadata = {
  title: 'Marketplace',
  description: 'Tous les comptes gaming vérifiés disponibles à l\'achat.',
};

async function getListings(): Promise<Paginated<Listing> | null> {
  try {
    return await apiFetch<Paginated<Listing>>('/api/v1/listings');
  } catch {
    return null;
  }
}

export default async function MarketplacePage() {
  const result = await getListings();

  return (
    <>
      <SiteNav />
      <main className="mx-auto max-w-6xl px-5 py-12">
        <h1 className="font-display text-3xl text-bone">Marketplace</h1>
        <p className="mt-2 text-bone/60">Comptes gaming vérifiés, remis en toute sécurité.</p>

        {!result || result.items.length === 0 ? (
          <div className="mt-10 rounded-ticket border border-white/10 bg-navy-mid p-10 text-center">
            <p className="font-display text-lg text-bone">Aucune annonce disponible</p>
            <p className="mt-2 text-sm text-bone/60">
              Le catalogue se remplit dès les premières annonces publiées par nos vendeurs.
            </p>
            <Link
              href="/affiliate"
              className="mt-6 inline-block rounded-full border border-white/15 px-5 py-2.5 text-sm text-bone hover:border-white/30"
            >
              Découvrir le programme d&apos;affiliation
            </Link>
          </div>
        ) : (
          <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {result.items.map((listing) => (
              <ListingCard key={listing._id} listing={listing} />
            ))}
          </div>
        )}
      </main>
      <SiteFooter />
    </>
  );
}
