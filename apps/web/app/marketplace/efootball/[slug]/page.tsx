import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  BadgeCheck,
  Check,
  Eye,
  Lock,
  MapPin,
  ShieldCheck,
  Star,
  Users,
} from 'lucide-react';
import { SiteNav } from '@/components/site-nav';
import { SiteFooter } from '@/components/site-footer';
import { ListingGallery } from '@/components/listing-gallery';
import { BuyButton } from '@/components/buy-button';
import { apiFetch } from '@/lib/api-client';
import { breadcrumbJsonLd } from '@/lib/seo';
import type { Listing } from '@gm/types';

async function getListing(slug: string): Promise<Listing | null> {
  try {
    const data = await apiFetch<{ listing: Listing }>(`/api/v1/listings/${slug}`);
    return data.listing;
  } catch {
    return null;
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const listing = await getListing(slug);
  if (!listing) return {};
  const coverImage: string | undefined = listing.screenshots[0];
  return {
    title: listing.title,
    description: listing.description.slice(0, 155),
    openGraph: {
      images: coverImage ? [{ url: coverImage }] : undefined,
    },
  };
}

function StatCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-ticket border border-white/10 bg-navy-mid px-4 py-3">
      <p className="text-[11px] uppercase tracking-wider text-bone/40">{label}</p>
      <p className="mt-1 font-mono text-sm text-bone">{value}</p>
    </div>
  );
}

function PlayerChips({ label, players }: { label: string; players?: string[] }) {
  if (!players || players.length === 0) return null;
  const epic = label === 'Joueurs Epic';
  return (
    <div>
      <p className="font-mono text-xs uppercase tracking-[0.15em] text-bone/40">{label}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {players.map((p) => (
          <span
            key={p}
            className={`rounded-full border px-3 py-1 text-xs ${
              epic ? 'border-gold/40 text-gold' : 'border-white/15 text-bone/70'
            }`}
          >
            {epic ? <Star size={11} className="mr-1 inline" /> : null}
            {p}
          </span>
        ))}
      </div>
    </div>
  );
}

export default async function ListingDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const listing = await getListing(slug);
  if (!listing) notFound();

  const verified = listing.moderationStatus === 'APPROVED';
  const coverImage = listing.screenshots[0];

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: listing.title,
    description: listing.description,
    image: listing.screenshots,
    offers: {
      '@type': 'Offer',
      price: listing.price,
      priceCurrency: listing.currency,
      availability: 'https://schema.org/InStock',
    },
  };

  return (
    <>
      <SiteNav />
      <main className="mx-auto max-w-6xl px-5 pb-12 pt-8 md:pt-10">
        <script
          type="application/ld+json"
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        <script
          type="application/ld+json"
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(
              breadcrumbJsonLd([
                { name: 'Accueil', url: '/' },
                { name: 'eFootball', url: '/marketplace/efootball' },
                { name: listing.title, url: `/marketplace/efootball/${listing.slug}` },
              ]),
            ),
          }}
        />

        <nav aria-label="Fil d'Ariane" className="flex gap-2 text-xs text-bone/40">
          <Link href="/marketplace" className="hover:text-bone">
            Marketplace
          </Link>
          <span>/</span>
          <Link href="/marketplace/efootball" className="hover:text-bone">
            eFootball
          </Link>
          <span>/</span>
          <span className="truncate text-bone/60">{listing.title}</span>
        </nav>

        <div className="mt-6 grid gap-10 lg:grid-cols-[minmax(0,1fr),360px]">
          {/* Colonne principale */}
          <div className="min-w-0">
            <ListingGallery images={listing.screenshots} title={listing.title} />

            <div className="mt-6 flex flex-wrap items-center gap-3">
              {verified ? (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1 text-xs font-medium text-emerald-300">
                  <BadgeCheck size={14} /> Annonce vérifiée par la modération
                </span>
              ) : null}
              <span className="inline-flex items-center gap-1.5 text-xs text-bone/40">
                <Eye size={13} /> {listing.views} vues
              </span>
            </div>

            {/* Prix + achat — placés en haut sur mobile, la sidebar les reprend en desktop */}
            <div className="mt-5 flex items-end justify-between gap-4 lg:hidden">
              <p>
                <span className="block text-xs uppercase tracking-wider text-bone/40">
                  Prix de vente
                </span>
                <span className="mt-1 block font-mono text-2xl text-gold">
                  {listing.price.toLocaleString('fr-FR')}{' '}
                  <span className="text-sm">{listing.currency}</span>
                </span>
              </p>
            </div>

            <h1 className="mt-4 font-display text-2xl leading-tight text-bone sm:text-3xl">{listing.title}</h1>

            <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <StatCell label="Force d'équipe" value={listing.teamStrength?.toString() ?? '—'} />
              <StatCell label="Joueurs" value={listing.playerCount?.toString() ?? '—'} />
              <StatCell label="Pays" value={listing.country === 'SN' ? 'Sénégal' : listing.country} />
              <StatCell
                label="Publiée le"
                value={new Date(listing.createdAt).toLocaleDateString('fr-FR')}
              />
            </div>

            {(listing.epicPlayers?.length ?? 0) +
              (listing.showTimePlayers?.length ?? 0) +
              (listing.featuredPlayers?.length ?? 0) >
            0 ? (
              <section className="mt-8 space-y-5 rounded-ticket border border-white/10 bg-navy-mid p-6">
                <h2 className="font-display text-lg text-bone">Effectif du compte</h2>
                <PlayerChips label="Joueurs Epic" players={listing.epicPlayers} />
                <PlayerChips label="Joueurs Show Time" players={listing.showTimePlayers} />
                <PlayerChips label="Joueurs mis en avant" players={listing.featuredPlayers} />
              </section>
            ) : null}

            <section className="mt-8">
              <h2 className="font-display text-lg text-bone">Description</h2>
              <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-bone/70">
                {listing.description}
              </p>
            </section>

            {/* Réassurance — comment fonctionne le séquestre */}
            <section className="mt-10 rounded-ticket border border-gold/20 bg-navy-mid p-6">
              <h2 className="flex items-center gap-2 font-display text-lg text-bone">
                <ShieldCheck size={18} className="text-gold" /> Comment se passe l&apos;achat ?
              </h2>
              <ol className="mt-4 grid gap-4 sm:grid-cols-3">
                {[
                  {
                    title: '1. Vous payez',
                    body: 'Orange Money ou Wave. Vos fonds sont bloqués sur la plateforme, pas envoyés au vendeur.',
                  },
                  {
                    title: '2. Recevez le compte',
                    body: 'Le vendeur transmet les identifiants via la plateforme dès le paiement confirmé.',
                  },
                  {
                    title: '3. Confirmez la réception',
                    body: 'Le vendeur est payé uniquement après votre validation. Litige possible sinon.',
                  },
                ].map((step) => (
                  <li key={step.title} className="rounded-lg border border-white/10 p-4">
                    <p className="text-sm font-semibold text-gold">{step.title}</p>
                    <p className="mt-1.5 text-xs leading-relaxed text-bone/60">{step.body}</p>
                  </li>
                ))}
              </ol>
            </section>
          </div>

          {/* Barre latérale achat */}
          <aside className="h-fit space-y-4 lg:sticky lg:top-24">
            <div className="ticket-notch hidden rounded-ticket border border-white/10 bg-navy-mid p-6 lg:block">
              <p className="text-xs uppercase tracking-wider text-bone/40">Prix de vente</p>
              <p className="mt-1 font-mono text-3xl text-gold">
                {listing.price.toLocaleString('fr-FR')}{' '}
                <span className="text-base">{listing.currency}</span>
              </p>

              <div className="hidden lg:block">
                <BuyButton listingId={listing._id} />
              </div>

              <ul className="mt-5 space-y-2.5 border-t border-white/10 pt-4">
                {[
                  'Fonds bloqués en séquestre jusqu’à votre confirmation',
                  'Identifiants transmis via la plateforme, jamais en direct',
                  'Litiges arbitrés par notre équipe',
                ].map((g) => (
                  <li key={g} className="flex items-start gap-2 text-xs text-bone/60">
                    <Check size={14} className="mt-0.5 flex-none text-emerald-300" />
                    {g}
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-ticket border border-white/10 bg-navy-deep p-4">
              <p className="flex items-center gap-2 text-xs text-bone/50">
                <Lock size={13} className="text-gold" />
                Paiement Mobile Money chiffré · Orange Money & Wave acceptés
              </p>
              <p className="mt-2 flex items-center gap-2 text-xs text-bone/50">
                <Users size={13} className="text-gold" /> Remise sécurisée partout au Sénégal
              </p>
              <p className="mt-2 flex items-center gap-2 text-xs text-bone/50">
                <MapPin size={13} className="text-gold" /> Dakar · Thiès · Saint-Louis · Touba
              </p>
            </div>
          </aside>
        </div>

        {/* Barre d'achat fixe — mobile/tablette uniquement, toujours accessible */}
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-white/10 bg-navy-deep/95 px-4 pb-safe backdrop-blur lg:hidden">
          <div className="mx-auto flex max-w-6xl items-center gap-4 py-3">
            <p className="min-w-0">
              <span className="block font-mono text-lg leading-tight text-gold">
                {listing.price.toLocaleString('fr-FR')}{' '}
                <span className="text-xs">{listing.currency}</span>
              </span>
              <span className="block truncate text-[11px] text-bone/40">
                Paiement Orange Money / Wave
              </span>
            </p>
            <div className="ml-auto w-40 max-w-[50%] shrink-0 sm:w-48">
              <BuyButton listingId={listing._id} compact />
            </div>
          </div>
        </div>
      </main>
      <SiteFooter />
      {/* Compense la barre d'achat fixe pour ne pas masquer le pied de page */}
      <div aria-hidden className="h-16 bg-navy-deep lg:hidden" />
    </>
  );
}
