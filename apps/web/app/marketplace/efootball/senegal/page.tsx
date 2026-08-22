import type { Metadata } from 'next';
import Link from 'next/link';
import { SiteNav } from '@/components/site-nav';
import { SiteFooter } from '@/components/site-footer';
import { apiFetch } from '@/lib/api-client';
import type { Listing, Paginated } from '@gm/types';
import { breadcrumbJsonLd, faqJsonLd } from '@/lib/seo';

export const metadata: Metadata = {
  title: 'Acheter un compte eFootball au Sénégal — Paiement Orange Money & Wave',
  description:
    'Compte eFootball au Sénégal: comment acheter en toute sécurité, moyens de paiement acceptés (Orange Money, Wave), livraison à Dakar, Thiès, Saint-Louis, Touba et partout au pays.',
  alternates: { canonical: '/marketplace/efootball/senegal' },
};

const SENEGAL_CITIES = ['Dakar', 'Thiès', 'Saint-Louis', 'Touba', 'Ziguinchor', 'Kaolack'];

const SENEGAL_FAQ = [
  {
    question: 'Quels moyens de paiement sont acceptés au Sénégal ?',
    answer:
      'Orange Money et Wave sont acceptés via notre prestataire de paiement CinetPay, disponibles dans tout le pays.',
  },
  {
    question: 'Puis-je acheter un compte eFootball si je ne suis pas à Dakar ?',
    answer:
      'Oui — la remise du compte se fait entièrement en ligne. Que vous soyez à Thiès, Saint-Louis, Touba ou ailleurs au Sénégal, le processus est identique.',
  },
  {
    question: 'Combien de temps prend une transaction ?',
    answer:
      'Le paiement est confirmé en quelques minutes. Le vendeur transmet ensuite les accès, généralement sous quelques heures selon sa disponibilité.',
  },
];

async function getSenegalListings(): Promise<Paginated<Listing> | null> {
  try {
    return await apiFetch<Paginated<Listing>>('/api/v1/listings?game=efootball&country=SN');
  } catch {
    return null;
  }
}

export default async function EfootballSenegalPage() {
  const result = await getSenegalListings();

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
              { name: 'eFootball', url: '/marketplace/efootball' },
              { name: 'Sénégal', url: '/marketplace/efootball/senegal' },
            ]),
          ),
        }}
      />
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd(SENEGAL_FAQ)) }}
      />

      <main className="mx-auto max-w-6xl px-5 py-12">
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-gold">
          eFootball · Sénégal
        </p>
        <h1 className="mt-2 font-display text-3xl text-bone">
          Acheter un compte eFootball au Sénégal
        </h1>
        <p className="mt-3 max-w-2xl text-bone/60">
          Le marché des comptes eFootball au Sénégal se fait traditionnellement via WhatsApp ou
          des groupes Facebook — avec les risques d&apos;arnaque que ça implique. Notre
          marketplace sert de tiers de confiance : le vendeur ne reçoit son paiement
          qu&apos;après votre confirmation, et le paiement se fait par Orange Money ou Wave,
          les moyens que vous utilisez déjà au quotidien.
        </p>

        <div className="mt-6 flex flex-wrap gap-2">
          {SENEGAL_CITIES.map((city) => (
            <span
              key={city}
              className="rounded-full border border-white/10 px-3 py-1 text-xs text-bone/50"
            >
              {city}
            </span>
          ))}
        </div>

        {!result || result.items.length === 0 ? (
          <div className="mt-10 rounded-ticket border border-white/10 bg-navy-mid p-10 text-center">
            <p className="font-display text-lg text-bone">
              Aucun compte disponible au Sénégal pour l&apos;instant
            </p>
            <p className="mt-2 text-sm text-bone/60">
              Les premières annonces vérifiées arrivent bientôt.
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
              <Link
                key={listing._id}
                href={`/marketplace/efootball/${listing.slug}`}
                className="ticket-notch rounded-ticket border border-white/10 bg-navy-mid p-5 hover:border-gold/40"
              >
                <p className="font-display text-base text-bone">{listing.title}</p>
                <p className="mt-3 font-mono text-lg text-gold">
                  {listing.price.toLocaleString('fr-FR')} {listing.currency}
                </p>
              </Link>
            ))}
          </div>
        )}

        {/* FAQ localisée — contenu réel, pas dupliqué de la page eFootball
            générique, justifie l'indexation distincte de cette page. */}
        <section className="mt-16 border-t border-white/10 pt-10">
          <h2 className="font-display text-xl text-bone">Questions sur l&apos;achat au Sénégal</h2>
          <div className="mt-6 space-y-5">
            {SENEGAL_FAQ.map((item) => (
              <div key={item.question}>
                <p className="font-display text-base text-bone">{item.question}</p>
                <p className="mt-1 text-sm text-bone/60">{item.answer}</p>
              </div>
            ))}
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
