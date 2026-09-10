'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api-client';
import {
  Copy,
  Check,
  ArrowLeft,
  MessageCircle,
  Phone,
  Share2,
  Lightbulb,
  AlertTriangle,
  CheckCircle2,
  Smartphone,
  Monitor,
} from 'lucide-react';
import { SiteNav } from '@/components/site-nav';
import { SiteFooter } from '@/components/site-footer';

interface AffiliateData {
  affiliateCode: string;
  status: string;
  tier?: { name: string };
}

const CHANNELS = [
  {
    id: 'whatsapp-status',
    title: 'Statut WhatsApp',
    subtitle: 'Visible 24h, idéal pour toucher tout le monde',
    icon: <Phone className="h-5 w-5" />,
    color: 'bg-emerald-600',
    tips: [
      'Poster entre 18h et 21h (pic d\'activité)',
      'Ajoutez une photo/vidéo du jeu pour attirer l\'œil',
      'Utilisez 2-3 emojis max, pas trop de texte',
    ],
    buildMessage: (link: string) =>
      `🎮 Tu joues à eFootball ?\n\nRegarde Gaming Marketplace — c\'est la seule plateforme où tu peux acheter/vendre des comptes en toute sécurité (système d\'escrow).\n\n👉 ${link}\n\n✅ Sécurisé | ✅ Prix du marché | ✅ Zéro arnaque`,
    exampleVisual: '📱 *Statut WhatsApp* → Photo du jeu + texte ci-dessus',
  },
  {
    id: 'whatsapp-group',
    title: 'Groupes WhatsApp',
    subtitle: 'Groupes eFootball, gaming, amis',
    icon: <MessageCircle className="h-5 w-5" />,
    color: 'bg-emerald-700',
    tips: [
      'Ne spammez pas — 1 message par groupe, pas plus',
      'Adaptez selon le contexte du groupe',
      'Répondez aux questions pour montrer votre légitimité',
    ],
    buildMessage: (link: string) =>
      `Salut tout le monde ! 👋\n\nJe viens de découvrir Gaming Marketplace pour les comptes eFootball / FC Mobile. C\'est sécurisé grâce à un système d\'escrow (l\'argent est bloqué jusqu\'à la livraison).\n\nÇa vaut le coup d\'y jeter un œil :\n👉 ${link}\n\nSi vous avez des questions, je peux expliquer comment ça marche !`,
    exampleVisual: '💬 Dans le groupe → Message personnalisé ci-dessus',
  },
  {
    id: 'facebook-post',
    title: 'Publication Facebook',
    subtitle: 'Statut ou post dans un groupe',
    icon: <Monitor className="h-5 w-5" />,
    color: 'bg-blue-600',
    tips: [
      'Publiez dans des groupes eFootball/FC Mobile',
      'Ajoutez une image pour plus de visibilité',
      'Répondez aux commentaires pour booster l\'algorithme',
    ],
    buildMessage: (link: string) =>
      `🎮 Si vous jouez à eFootball ou FC Mobile, regardez ça.\n\nGaming Marketplace est une plateforme qui sécurise les transactions de comptes et services gaming. Le système d\'escrow protège acheteur et vendeur.\n\n✅ Pas d\'arnaques\n✅ Prix du marché\n✅ Suivi en temps réel\n\n👉 ${link}\n\nPosez vos questions en commentaire !`,
    exampleVisual: '📘 Post Facebook → Copiez le texte + ajoutez une capture d\'écran',
  },
  {
    id: 'facebook-story',
    title: 'Story / Statut Facebook',
    subtitle: 'Court et percutant',
    icon: <Smartphone className="h-5 w-5" />,
    color: 'bg-blue-700',
    tips: [
      'Story = format vertical, 15 secondes max',
      'Montrez l\'interface du site en vidéo courte',
      'Lien dans la description ou en commentaire',
    ],
    buildMessage: (link: string) =>
      `Stop aux arnaques eFootball 🎮\n\nGaming Marketplace = transactions sécurisées.\n\n👉 ${link}`,
    exampleVisual: '📱 Story → Vidéo courte ou image + texte ci-dessus',
  },
  {
    id: 'tiktok',
    title: 'TikTok / Reels',
    subtitle: 'Vidéo courte, fort potentiel viral',
    icon: <Share2 className="h-5 w-5" />,
    color: 'bg-pink-600',
    tips: [
      'Vidéo de 15-30 secondes montrant le site',
      'Utilisez des sons tendance',
      'Lien en bio ou en commentaire pinned',
      'Hashtags : #eFootball #FCMobile #Gaming #Marketplace',
    ],
    buildMessage: (link: string) =>
      `🎮 STOP aux arnaques eFootball !\n\nGaming Marketplace c\'est : \n✅ Sécurisé (escrow)\n✅ Prix du marché\n✅ Zéro stress\n\nLien en bio 👆\n\n#eFootball #FCMobile #Gaming #Marketplace #MobileGaming`,
    exampleVisual: '📱 Vidéo 15s → Montrer le site + texte en overlay',
  },
  {
    id: 'story-optimise',
    title: 'Story Instagram / TikTok',
    subtitle: 'Story = vincular link directly',
    icon: <Smartphone className="h-5 w-5" />,
    color: 'bg-purple-600',
    tips: [
      'Mettez le lien cliquable dans la story',
      'Utilisez le sticker "lien" sur Instagram',
      'Texte court + emoji = plus d\'engagement',
    ],
    buildMessage: (link: string) =>
      `🛒 Tu veux acheter/vendre un compte eFootball ?\n\nGaming Marketplace 🔒\nTransactions sécurisées\n\n👉 ${link}`,
    exampleVisual: '📱 Story avec sticker lien → Le texte ci-dessus',
  },
];

export default function OnboardingPage() {
  const [affiliate, setAffiliate] = useState<AffiliateData | null | undefined>(undefined);
  const [origin, setOrigin] = useState('');

  useEffect(() => {
    setOrigin(window.location.origin);
    apiFetch<{ affiliate: AffiliateData }>('/api/v1/affiliates/me')
      .then((d) => setAffiliate(d.affiliate))
      .catch(() => setAffiliate(null));
  }, []);

  const link = affiliate ? `${origin}/ref/${affiliate.affiliateCode}` : '';

  return (
    <>
      <SiteNav />
      <main className="mx-auto max-w-3xl px-5 py-12">
        {/* Header */}
        <a
          href="/dashboard/affiliate"
          className="mb-6 flex items-center gap-1.5 text-sm text-bone/50 hover:text-bone"
        >
          <ArrowLeft className="h-4 w-4" />
          Retour au tableau de bord
        </a>

        <h1 className="font-display text-3xl text-bone">
          Guide de partage
        </h1>
        <p className="mt-3 max-w-xl text-bone/60">
          Voici exactement quoi poster sur chaque plateforme pour maximiser vos clics.
          Copiez les messages, personnalisez-les si vous voulez, et postez.
        </p>

        {/* Rappel du lien */}
        {link && (
          <div className="mt-6 rounded-ticket border border-gold/20 bg-gold/5 p-4">
            <p className="text-xs font-medium uppercase tracking-widest text-gold/70">
              Votre lien d&apos;affiliation
            </p>
            <CopyWithConfirm value={link} />
          </div>
        )}

        {/* Checklist rapide */}
        <div className="mt-8 rounded-ticket border border-mint/20 bg-mint/5 p-5">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-mint" />
            <p className="text-sm font-medium text-mint">Avant de commencer</p>
          </div>
          <ul className="mt-3 space-y-2 text-sm text-bone/70">
            <li className="flex items-start gap-2">
              <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-mint" />
              Choisissez 2-3 canaux maximum (WhatsApp + 1 réseau social)
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-mint" />
              Ne spammez pas — 1 post par groupe, pas plus
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-mint" />
              Répondez aux questions pour montrer que vous êtes légitime
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-mint" />
              Postez entre 18h et 21h pour plus de visibilité
            </li>
          </ul>
        </div>

        {/* Canaux */}
        <div className="mt-10 space-y-6">
          <h2 className="font-display text-xl text-bone">
            Messages pré-remplis par canal
          </h2>
          <p className="text-sm text-bone/50">
            Cliquez sur &quot;Copier&quot; pour avoir le texte prêt à coller.
          </p>

          {CHANNELS.map((ch) => (
            <ChannelCard key={ch.id} channel={ch} link={link} />
          ))}
        </div>

        {/* Conseils bonus */}
        <div className="mt-10 rounded-ticket border border-gold/20 bg-gold/5 p-6">
          <div className="flex items-center gap-2">
            <Lightbulb className="h-5 w-5 text-gold" />
            <h3 className="font-display text-lg text-bone">Conseils pour maximiser vos clics</h3>
          </div>
          <ul className="mt-4 space-y-3 text-sm text-bone/70">
            <li className="flex items-start gap-3">
              <span className="mt-0.5 text-lg">📸</span>
              <div>
                <p className="font-medium text-bone">Ajoutez une visuelle</p>
                <p>Un screenshot du site ou une capture de transaction flow attire 3x plus l&apos;œil qu&apos;un texte seul.</p>
              </div>
            </li>
            <li className="flex items-start gap-3">
              <span className="mt-0.5 text-lg">🎥</span>
              <div>
                <p className="font-medium text-bone">Vidéos courtes = plus d&apos;engagement</p>
                <p>15-30 secondes en montrant le site suffisent. Pas besoin de montage pro.</p>
              </div>
            </li>
            <li className="flex items-start gap-3">
              <span className="mt-0.5 text-lg">💬</span>
              <div>
                <p className="font-medium text-bone">Répondez aux commentaires</p>
                <p>Chaque réponse booste la visibilité de votre post dans l&apos;algorithme.</p>
              </div>
            </li>
            <li className="flex items-start gap-3">
              <span className="mt-0.5 text-lg">🔄</span>
              <div>
                <p className="font-medium text-bone">Rappelez-vous régulièrement</p>
                <p>Un statut WhatsApp par semaine, un post Facebook par mois — la constance paie.</p>
              </div>
            </li>
          </ul>
        </div>

        {/* Erreurs à éviter */}
        <div className="mt-6 rounded-ticket border border-coral/20 bg-coral/5 p-6">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-coral" />
            <h3 className="font-display text-lg text-bone">Erreurs à éviter</h3>
          </div>
          <ul className="mt-4 space-y-2 text-sm text-bone/70">
            <li className="flex items-start gap-2">
              <span className="text-coral">✕</span>
              Poster le même message dans 10 groupes WhatsApp d&apos;un coup → vous serez bloqué
            </li>
            <li className="flex items-start gap-2">
              <span className="text-coral">✕</span>
              Utiliser &quot;Gagnez de l&apos;argent&quot; comme accroche → ça fait arnaque
            </li>
            <li className="flex items-start gap-2">
              <span className="text-coral">✕</span>
              Coller le lien sans contexte → les gens ne cliquent pas sur un lien nu
            </li>
            <li className="flex items-start gap-2">
              <span className="text-coral">✕</span>
              Ne jamais répondre aux commentaires → ça réduit la portée
            </li>
          </ul>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}

function ChannelCard({
  channel,
  link,
}: {
  channel: (typeof CHANNELS)[number];
  link: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const message = channel.buildMessage(link);

  async function handleCopy() {
    await navigator.clipboard.writeText(message);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="rounded-ticket border border-white/10 bg-navy-mid overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-3 p-5 text-left"
      >
        <div className={`flex h-10 w-10 items-center justify-center rounded-full text-white ${channel.color}`}>
          {channel.icon}
        </div>
        <div className="flex-1">
          <p className="text-sm font-medium text-bone">{channel.title}</p>
          <p className="text-xs text-bone/50">{channel.subtitle}</p>
        </div>
        <span className="text-xs text-bone/40">
          {expanded ? '▲ Fermer' : '▼ Voir le message'}
        </span>
      </button>

      {/* Expanded content */}
      {expanded && (
        <div className="border-t border-white/10 px-5 pb-5 pt-4">
          {/* Message */}
          <div className="rounded-lg border border-white/10 bg-navy-deep p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-bone/40">Message prêt à coller</span>
              <button
                onClick={handleCopy}
                className="flex items-center gap-1.5 rounded-full bg-gold/15 px-3 py-1 text-xs font-medium text-gold hover:bg-gold/25"
              >
                {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                {copied ? 'Copié !' : 'Copier'}
              </button>
            </div>
            <pre className="whitespace-pre-wrap text-sm leading-relaxed text-bone/70">
              {message}
            </pre>
          </div>

          {/* Tips */}
          <div className="mt-4">
            <p className="text-xs font-medium uppercase tracking-widest text-bone/40 mb-2">
              Conseils
            </p>
            <ul className="space-y-1.5">
              {channel.tips.map((tip, i) => (
                <li key={i} className="flex items-start gap-2 text-xs text-bone/60">
                  <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-gold" />
                  {tip}
                </li>
              ))}
            </ul>
          </div>

          {/* Example visual */}
          <p className="mt-3 text-xs text-bone/40 italic">{channel.exampleVisual}</p>
        </div>
      )}
    </div>
  );
}

function CopyWithConfirm({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  return (
    <div className="mt-2 flex items-center gap-3">
      <code className="flex-1 truncate rounded bg-navy-deep px-3 py-2 font-mono text-sm text-bone">
        {value}
      </code>
      <button
        onClick={handleCopy}
        className="flex shrink-0 items-center gap-1.5 rounded-full bg-gold/15 px-3 py-1.5 text-xs font-medium text-gold hover:bg-gold/25"
      >
        {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
        {copied ? 'Copié' : 'Copier'}
      </button>
    </div>
  );
}
