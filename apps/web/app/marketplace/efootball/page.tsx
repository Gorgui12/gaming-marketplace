import type { Metadata } from 'next';
import { SiteNav } from '@/components/site-nav';
import { SiteFooter } from '@/components/site-footer';
import { apiFetch } from '@/lib/api-client';
import type { Listing, Paginated } from '@gm/types';
import Link from 'next/link';
import { ListingCard } from '@/components/listing-card';
import { breadcrumbJsonLd } from '@/lib/seo';

export const revalidate = 60;

export const metadata: Metadata = {
  title: 'Comptes eFootball à vendre au Sénégal | Dakar, Thiès, tout le pays',
  description:
    'Achetez un compte eFootball vérifié au Sénégal — paiement Orange Money ou Wave, vendeurs de confiance, remise sécurisée. Livraison partout au Sénégal.',
  alternates: { canonical: '/marketplace/efootball' },
};

async function getEfootballListings(): Promise<Paginated<Listing> | null> {
  try {
    return await apiFetch<Paginated<Listing>>('/api/v1/listings?game=efootball');
  } catch {
    return null;
  }
}

export default async function EfootballMarketplacePage() {
  const result = await getEfootballListings();

  return (
    <>
      <SiteNav />
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(
            breadcrumbJsonLd([
              { name: 'Accueil', url: '/' },
              { name: 'Marketplace', url: '/marketplace' },
              { name: 'eFootball', url: '/marketplace/efootball' },
            ]),
          ),
        }}
      />
      <main className="mx-auto max-w-6xl px-5 py-12">
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-gold">eFootball · Sénégal</p>
        <h1 className="mt-2 font-display text-3xl text-bone">
          Comptes eFootball à vendre au Sénégal
        </h1>
        <p className="mt-2 max-w-xl text-bone/60">
          Équipes constituées, joueurs Epic et Showtime, vérifiés avant publication. Paiement
          Orange Money ou Wave, remise sécurisée partout au Sénégal — Dakar, Thiès, Saint-Louis,
          Touba et au-delà.
        </p>
        <Link
          href="/marketplace/efootball/senegal"
          className="mt-3 inline-block text-sm text-gold hover:underline"
        >
          Voir le guide d&apos;achat spécifique au Sénégal →
        </Link>

        {!result || result.items.length === 0 ? (
          <div className="mt-10 rounded-ticket border border-white/10 bg-navy-mid p-10 text-center">
            <p className="font-display text-lg text-bone">Aucun compte disponible pour l&apos;instant</p>
            <p className="mt-2 text-sm text-bone/60">
              Revenez bientôt — de nouvelles annonces sont publiées régulièrement.
            </p>
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
