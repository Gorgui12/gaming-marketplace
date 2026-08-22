import Link from 'next/link';
import { ShieldCheck, Wallet, Users } from 'lucide-react';
import { SiteNav } from '@/components/site-nav';
import { SiteFooter } from '@/components/site-footer';
import { TicketStub } from '@/components/ticket-stub';
import { faqJsonLd } from '@/lib/seo';

const FAQ_ITEMS = [
  {
    question: 'Est-ce que je peux payer par Orange Money ou Wave au Sénégal ?',
    answer:
      'Oui. Le paiement se fait par Mobile Money (Orange Money, Wave) via notre prestataire CinetPay, disponible partout au Sénégal.',
  },
  {
    question: 'Comment savoir si un vendeur est fiable à Dakar ?',
    answer:
      'Chaque vendeur affiche sa réputation (note moyenne, nombre de ventes réussies). Les fonds ne sont libérés qu\'après votre confirmation, donc vous n\'avez jamais à faire confiance aveuglément.',
  },
  {
    question: 'Que se passe-t-il si le compte eFootball ne correspond pas à l\'annonce ?',
    answer:
      'Vous pouvez ouvrir un litige directement depuis votre tableau de bord. Notre équipe examine les preuves et tranche — remboursement ou paiement au vendeur selon le cas.',
  },
  {
    question: 'Livrez-vous dans tout le Sénégal ou seulement à Dakar ?',
    answer:
      'La marketplace est 100% en ligne — la remise des accès du compte se fait via la plateforme, où que vous soyez au Sénégal (Dakar, Thiès, Saint-Louis, Touba, etc.).',
  },
];

export default function HomePage() {
  return (
    <>
      <SiteNav />
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd(FAQ_ITEMS)) }}
      />
      <main>
        {/* HERO — le talon de billet, thèse du produit */}
        <section className="relative overflow-hidden border-b border-white/10 bg-navy">
          <div className="mx-auto grid max-w-6xl items-center gap-10 px-5 pb-16 pt-12 md:grid-cols-2 md:py-28 lg:gap-12">
            <div>
              <p className="font-mono text-[11px] uppercase leading-relaxed tracking-[0.15em] text-gold sm:text-xs sm:tracking-[0.2em]">
                Dakar · Sénégal · eFootball · Orange Money & Wave
              </p>
              <h1 className="mt-4 font-display text-3xl leading-[1.08] text-bone sm:text-4xl md:text-5xl">
                Achetez et vendez des comptes eFootball au Sénégal{' '}
                <span className="text-gold">sans avoir à faire confiance</span> à un inconnu.
              </h1>
              <p className="mt-5 max-w-md text-sm text-bone/60 sm:text-base">
                Fini WhatsApp et les groupes Facebook. Chaque transaction passe par notre
                séquestre : le vendeur ne livre qu&apos;après paiement Orange Money ou Wave
                confirmé, l&apos;acheteur ne paie que ce qu&apos;il a vu.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                <Link
                  href="/marketplace/efootball"
                  className="rounded-full bg-gold px-6 py-3.5 text-center text-sm font-semibold text-navy-deep hover:bg-gold-soft"
                >
                  Acheter un compte
                </Link>
                <Link
                  href="/marketplace"
                  className="rounded-full border border-white/15 px-6 py-3.5 text-center text-sm text-bone hover:border-white/30"
                >
                  Vendre mon compte
                </Link>
              </div>
            </div>

            <TicketStub
              leftLabel="Vendeur"
              leftValue="Gorgui M."
              rightLabel="Statut"
              rightValue="45 000 FCFA"
              reference="GM-8F3K2A-01"
              status="active"
            />
          </div>
        </section>

        {/* COMMENT ÇA MARCHE */}
        <section className="border-b border-white/10 bg-navy-deep">
          <div className="mx-auto max-w-6xl px-5 py-16">
            <h2 className="font-display text-2xl text-bone">Comment ça marche</h2>
            <div className="mt-8 grid gap-6 md:grid-cols-3">
              <HowItWorksCard
                icon={<Wallet className="h-5 w-5" />}
                title="Paiement sécurisé"
                body="Payez par Mobile Money (Wave, Orange Money). Les fonds ne sont libérés au vendeur qu'après votre confirmation."
              />
              <HowItWorksCard
                icon={<ShieldCheck className="h-5 w-5" />}
                title="Remise vérifiée"
                body="Le vendeur transmet les accès via la plateforme, jamais par message privé. Vous vérifiez avant de valider."
              />
              <HowItWorksCard
                icon={<Users className="h-5 w-5" />}
                title="Litige arbitré"
                body="Un problème ? Notre équipe examine les preuves et tranche — remboursement ou paiement vendeur."
              />
            </div>
          </div>
        </section>

        {/* CTA final */}
        <section className="bg-navy">
          <div className="mx-auto max-w-6xl px-5 py-12 md:py-16">
            <div className="flex flex-col items-start gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="font-display text-2xl text-bone">Prêt à transiger en confiance ?</h2>
                <p className="mt-2 text-bone/60">
                  Des centaines de comptes eFootball vérifiés vous attendent au Sénégal.
                </p>
              </div>
              <Link
                href="/marketplace/efootball"
                className="w-full rounded-full bg-gold px-6 py-3.5 text-center text-sm font-semibold text-navy-deep hover:bg-gold-soft md:w-auto md:py-3"
              >
                Voir le catalogue
              </Link>
            </div>
          </div>
        </section>

        {/* FAQ — contenu réel ciblant les intentions de recherche locales,
            avec FAQPage JSON-LD pour les featured snippets Google */}
        <section className="border-t border-white/10 bg-navy-deep">
          <div className="mx-auto max-w-3xl px-5 py-16">
            <h2 className="font-display text-2xl text-bone">Questions fréquentes</h2>
            <div className="mt-8 space-y-6">
              {FAQ_ITEMS.map((item) => (
                <div key={item.question}>
                  <p className="font-display text-base text-bone">{item.question}</p>
                  <p className="mt-1.5 text-sm text-bone/60">{item.answer}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}

function HowItWorksCard({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div className="rounded-ticket border border-white/10 bg-navy-mid p-6">
      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gold/15 text-gold">
        {icon}
      </div>
      <p className="mt-4 font-display text-lg text-bone">{title}</p>
      <p className="mt-2 text-sm text-bone/60">{body}</p>
    </div>
  );
}
