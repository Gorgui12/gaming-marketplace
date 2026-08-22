import type { Metadata } from 'next';
import { Link2, TrendingUp, BarChart3, Wallet } from 'lucide-react';
import { SiteNav } from '@/components/site-nav';
import { SiteFooter } from '@/components/site-footer';
import { AffiliateApplyForm } from '@/components/affiliate-apply-form';

export const metadata: Metadata = {
  title: 'Devenir affilié',
  description:
    'Transformez votre communauté TikTok, YouTube ou WhatsApp en revenus grâce au programme d\'affiliation de la marketplace.',
};

const STEPS = [
  { n: '01', title: 'Inscrivez-vous', body: 'Candidature en 2 minutes, avec vos réseaux.' },
  { n: '02', title: 'Recevez votre lien', body: 'Un lien et un code promo personnalisés.' },
  { n: '03', title: 'Partagez', body: 'TikTok, YouTube, WhatsApp, Facebook — où vous voulez.' },
  { n: '04', title: 'Générez des ventes', body: 'Chaque achat via votre lien est tracké.' },
  { n: '05', title: 'Recevez vos commissions', body: 'Suivez vos gains en temps réel.' },
];

export default function AffiliateLandingPage() {
  return (
    <>
      <SiteNav />
      <main>
        <section className="border-b border-white/10 bg-navy">
          <div className="mx-auto max-w-4xl px-5 py-20 text-center md:py-28">
            <p className="font-mono text-xs uppercase tracking-[0.2em] text-gold">
              Programme d&apos;affiliation
            </p>
            <h1 className="mt-4 font-display text-4xl leading-tight text-bone md:text-5xl">
              Transformez votre communauté en revenus.
            </h1>
            <p className="mx-auto mt-5 max-w-xl text-bone/60">
              Partagez vos liens et codes promo, et gagnez une commission sur chaque
              transaction que vous générez sur la marketplace.
            </p>
            <a
              href="#candidature"
              className="mt-8 inline-block rounded-full bg-gold px-7 py-3 text-sm font-semibold text-navy-deep hover:bg-gold-soft"
            >
              Devenir affilié
            </a>
          </div>
        </section>

        {/* Avantages */}
        <section className="border-b border-white/10 bg-navy-deep">
          <div className="mx-auto max-w-6xl px-5 py-16">
            <div className="grid gap-6 md:grid-cols-4">
              <Advantage
                icon={<Link2 className="h-5 w-5" />}
                title="Lien personnalisé"
                body="Votre propre code, votre propre lien de suivi."
              />
              <Advantage
                icon={<TrendingUp className="h-5 w-5" />}
                title="Commissions évolutives"
                body="Du niveau Starter à Ambassador, le taux progresse avec vous."
              />
              <Advantage
                icon={<BarChart3 className="h-5 w-5" />}
                title="Statistiques en direct"
                body="Clics, conversions, chiffre d'affaires par campagne."
              />
              <Advantage
                icon={<Wallet className="h-5 w-5" />}
                title="Paiements suivis"
                body="Chaque commission est tracée du clic jusqu'au paiement."
              />
            </div>
          </div>
        </section>

        {/* Comment ça marche — véritable séquence, la numérotation est justifiée ici */}
        <section className="border-b border-white/10 bg-navy">
          <div className="mx-auto max-w-4xl px-5 py-16">
            <h2 className="font-display text-2xl text-bone">Comment ça marche</h2>
            <ol className="mt-8 space-y-6">
              {STEPS.map((step) => (
                <li key={step.n} className="flex gap-5">
                  <span className="font-mono text-sm text-gold/70">{step.n}</span>
                  <div>
                    <p className="font-display text-lg text-bone">{step.title}</p>
                    <p className="text-sm text-bone/60">{step.body}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Formulaire de candidature */}
        <section id="candidature" className="bg-navy-deep">
          <div className="mx-auto max-w-lg px-5 py-16">
            <h2 className="font-display text-2xl text-bone">Votre candidature</h2>
            <p className="mt-2 text-sm text-bone/60">
              Nous examinons chaque candidature pour garantir la qualité du programme.
            </p>
            <div className="mt-6">
              <AffiliateApplyForm />
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}

function Advantage({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div>
      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gold/15 text-gold">
        {icon}
      </div>
      <p className="mt-3 font-display text-base text-bone">{title}</p>
      <p className="mt-1 text-sm text-bone/60">{body}</p>
    </div>
  );
}
