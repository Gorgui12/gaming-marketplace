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

const TIERS = [
  { rate: '3 %', name: 'Débutant', min: '0' },
  { rate: '5 %', name: 'Confirmé', min: '10' },
  { rate: '7 %', name: 'Avancé', min: '50' },
  { rate: '9 %', name: 'Expert', min: '150' },
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
                body="4 niveaux : 3 %, 5 %, 7 % et 9 % sur le montant net de chaque vente."
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

        {/* Niveaux de commission */}
        <section className="border-b border-white/10 bg-navy">
          <div className="mx-auto max-w-4xl px-5 py-16">
            <h2 className="font-display text-2xl text-bone">4 niveaux de commission</h2>
            <p className="mt-2 max-w-xl text-sm text-bone/60">
              Votre taux est appliqué sur le montant net de chaque transaction générée
              (hors commission plateforme) — plus vous progressez, plus vous gagnez.
            </p>
            <div className="mt-8 grid gap-3 sm:grid-cols-4">
              {TIERS.map((t) => (
                <div
                  key={t.rate}
                  className="rounded-ticket border border-white/10 bg-navy-mid p-5 text-center"
                >
                  <p className="font-display text-3xl text-gold">{t.rate}</p>
                  <p className="mt-1 text-sm font-medium text-bone">{t.name}</p>
                  <p className="mt-1 text-xs text-bone/50">à partir de {t.min} conversions</p>
                </div>
              ))}
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
