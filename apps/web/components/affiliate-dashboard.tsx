'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api-client';
import {
  Copy,
  Check,
  MessageCircle,
  Send,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Share2,
  BookOpen,
} from 'lucide-react';

interface AffiliateData {
  affiliateCode: string;
  status: string;
  commissionRate: number;
  cookieDurationDays: number;
  totalClicks: number;
  totalConversions: number;
  totalRevenue: number;
  totalCommission: number;
  pendingCommission: number;
  availableCommission: number;
  tier?: { _id: string; name: string; slug: string; defaultCommissionRate: number };
}

const SHARE_TEMPLATES = {
  whatsapp: {
    label: 'WhatsApp',
    icon: '💬',
    color: 'bg-emerald-600 hover:bg-emerald-700',
    buildMessage: (link: string) =>
      `🎮 Tu joues à eFootball / FC Mobile ?\n\nRegarde ce site, c\'est une marketplace 100% sécurisée pour acheter et vendre des comptes, pièces et services eFootball.\n\n✅ Transactions sécurisées (escrow)\n✅ Pas d\'arnaques\n✅ Prix du marché\n\n👉 ${link}\n\nInscris-toi avec mon lien et tu auras un suivi de tes commandes en temps réel !`,
  },
  facebook: {
    label: 'Facebook',
    icon: '📘',
    color: 'bg-blue-600 hover:bg-blue-700',
    buildMessage: (link: string) =>
      `🎮 Besoin d\'acheter ou vendre un compte eFootball / FC Mobile en toute sécurité ?\n\nDécouvrez Gaming Marketplace — la plateforme qui sécurise chaque transaction avec un système d\'escrow.\n\n✅ Pas d\'arnaques\n✅ Prix du marché\n✅ Suivi en temps réel\n\n👉 ${link}`,
  },
  tiktok: {
    label: 'TikTok / Statut',
    icon: '📱',
    color: 'bg-pink-600 hover:bg-pink-700',
    buildMessage: (link: string) =>
      `🎮 Stop aux arnaques sur eFootball !\n\nUtilisez Gaming Marketplace — transactions sécurisées, prix du marché, zéro stress.\n\n👉 ${link}\n\n#eFootball #FCMobile #Gaming #Marketplace`,
  },
  copy: {
    label: 'Copier le message',
    icon: '📋',
    color: 'bg-white/10 hover:bg-white/20',
    buildMessage: (link: string) =>
      `🎮 Tu joues à eFootball / FC Mobile ? Regarde Gaming Marketplace — marketplace sécurisée pour comptes, pièces et services eFootball. Transactions protégées par escrow. ${link}`,
  },
};

function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  return (
    <div className="rounded-ticket border border-white/10 bg-navy-mid p-4">
      <p className="font-mono text-[11px] uppercase tracking-widest text-bone/40">{label}</p>
      <div className="mt-2 flex items-center justify-between gap-3">
        <p className="truncate font-mono text-sm text-bone">{value}</p>
        <button
          onClick={handleCopy}
          className="flex shrink-0 items-center gap-1.5 rounded-full bg-gold/15 px-3 py-1.5 text-xs font-medium text-gold hover:bg-gold/25"
        >
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? 'Copié' : 'Copier'}
        </button>
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-ticket border border-white/10 bg-navy-mid p-4">
      <p className="text-xs text-bone/50">{label}</p>
      <p className="mt-1 font-display text-xl text-bone">{value}</p>
    </div>
  );
}

function ShareButtons({ link }: { link: string }) {
  const [copiedMsg, setCopiedMsg] = useState(false);
  const [expanded, setExpanded] = useState(false);

  async function shareOrOpen(
    channel: keyof typeof SHARE_TEMPLATES,
    e: React.MouseEvent,
  ) {
    e.preventDefault();
    const tmpl = SHARE_TEMPLATES[channel];
    const msg = tmpl.buildMessage(link);

    if (channel === 'whatsapp') {
      const url = `https://api.whatsapp.com/send?text=${encodeURIComponent(msg)}`;
      window.open(url, '_blank', 'noopener');
    } else if (channel === 'facebook') {
      const url = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(link)}&quote=${encodeURIComponent(msg)}`;
      window.open(url, '_blank', 'noopener');
    } else if (channel === 'tiktok') {
      await navigator.clipboard.writeText(msg);
      setCopiedMsg(true);
      setTimeout(() => setCopiedMsg(false), 2200);
    } else if (channel === 'copy') {
      await navigator.clipboard.writeText(msg);
      setCopiedMsg(true);
      setTimeout(() => setCopiedMsg(false), 2200);
    }
  }

  return (
    <div className="rounded-ticket border border-white/10 bg-navy-mid p-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Share2 className="h-4 w-4 text-gold" />
          <p className="text-sm font-medium text-bone">Partage rapide</p>
        </div>
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-1 text-xs text-bone/50 hover:text-bone"
        >
          {expanded ? (
            <>
              Messages pré-remplis <ChevronUp className="h-3.5 w-3.5" />
            </>
          ) : (
            <>
              Voir les messages <ChevronDown className="h-3.5 w-3.5" />
            </>
          )}
        </button>
      </div>

      {/* Boutons principaux — toujours visibles */}
      <div className="mt-4 flex flex-wrap gap-2">
        {(Object.keys(SHARE_TEMPLATES) as Array<keyof typeof SHARE_TEMPLATES>).map((ch) => {
          const tmpl = SHARE_TEMPLATES[ch];
          return (
            <button
              key={ch}
              onClick={(e) => shareOrOpen(ch, e)}
              className={`flex items-center gap-2 rounded-full px-4 py-2.5 text-sm font-medium text-white transition ${tmpl.color}`}
            >
              <span>{tmpl.icon}</span>
              {ch === 'copy' && copiedMsg ? 'Message copié !' : tmpl.label}
            </button>
          );
        })}
      </div>

      {copiedMsg && (
        <p className="mt-2 text-xs text-mint">Message copié dans le presse-papier !</p>
      )}

      {/* Messages pré-remplis (expandable) */}
      {expanded && (
        <div className="mt-4 space-y-3">
          <p className="text-xs font-medium uppercase tracking-widest text-bone/40">
            Messages prêts à coller
          </p>
          {(Object.keys(SHARE_TEMPLATES) as Array<keyof typeof SHARE_TEMPLATES>).map((ch) => {
            const tmpl = SHARE_TEMPLATES[ch];
            const msg = tmpl.buildMessage(link);
            return (
              <TemplatePreview key={ch} channel={ch} template={tmpl} message={msg} />
            );
          })}
        </div>
      )}
    </div>
  );
}

function TemplatePreview({
  channel,
  template,
  message,
}: {
  channel: string;
  template: (typeof SHARE_TEMPLATES)[keyof typeof SHARE_TEMPLATES];
  message: string;
}) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(message);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  return (
    <div className="rounded-lg border border-white/10 bg-navy-deep p-3">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-xs font-medium text-bone/70">
          {template.icon} {template.label}
        </span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1 text-[11px] text-gold hover:text-gold-soft"
        >
          {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
          {copied ? 'Copié' : 'Copier'}
        </button>
      </div>
      <pre className="mt-2 whitespace-pre-wrap text-xs leading-relaxed text-bone/60">
        {message}
      </pre>
    </div>
  );
}

export function AffiliateDashboard() {
  const [affiliate, setAffiliate] = useState<AffiliateData | null | undefined>(undefined);
  const [origin, setOrigin] = useState('');

  useEffect(() => {
    setOrigin(window.location.origin);
    apiFetch<{ affiliate: AffiliateData }>('/api/v1/affiliates/me')
      .then((d) => setAffiliate(d.affiliate))
      .catch(() => setAffiliate(null));
  }, []);

  if (affiliate === undefined) {
    return <p className="text-sm text-bone/50">Chargement…</p>;
  }

  if (affiliate === null) {
    return (
      <div className="rounded-ticket border border-white/10 bg-navy-mid p-8 text-center">
        <p className="font-display text-lg text-bone">
          Vous n&apos;avez pas encore de compte affilié
        </p>
        <a
          href="/affiliate"
          className="mt-4 inline-block rounded-full bg-gold px-5 py-2.5 text-sm font-semibold text-navy-deep hover:bg-gold-soft"
        >
          Devenir affilié
        </a>
      </div>
    );
  }

  if (affiliate.status === 'PENDING') {
    return (
      <div className="rounded-ticket border border-gold/30 bg-gold/10 p-8 text-center">
        <p className="font-display text-lg text-bone">Candidature en cours d&apos;examen</p>
        <p className="mt-2 text-sm text-bone/60">
          Nous revenons vers vous rapidement. Votre lien sera actif dès l&apos;approbation.
        </p>
      </div>
    );
  }

  const link = `${origin}/ref/${affiliate.affiliateCode}`;

  return (
    <div className="space-y-6">
      {/* Lien et code */}
      <div className="grid gap-3 sm:grid-cols-2">
        <CopyField label="Votre lien" value={link} />
        <CopyField label="Votre code de parrainage" value={affiliate.affiliateCode} />
      </div>

      {/* Boutons de partage rapide */}
      <ShareButtons link={link} />

      {/* Lien onboarding */}
      <a
        href="/dashboard/affiliate/onboarding"
        className="flex items-center gap-2 rounded-ticket border border-gold/20 bg-gold/5 px-5 py-3 text-sm text-bone hover:bg-gold/10 transition"
      >
        <BookOpen className="h-4 w-4 text-gold" />
        <span>
          <span className="font-medium text-gold">Guide de partage</span>
          — Voici exactement quoi poster sur vos réseaux
        </span>
        <ExternalLink className="ml-auto h-3.5 w-3.5 text-bone/40" />
      </a>

      <p className="text-xs text-bone/40">
        Partagez votre lien : chaque achat effectué dans les {affiliate.cookieDurationDays} jours
        suivant un clic vous est automatiquement attribué. Votre code de parrainage est la partie
        unique du lien — pas un code de réduction à part entière.
      </p>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Clics" value={affiliate.totalClicks.toLocaleString('fr-FR')} />
        <StatCard label="Conversions" value={affiliate.totalConversions.toLocaleString('fr-FR')} />
        <StatCard
          label="CA généré"
          value={`${affiliate.totalRevenue.toLocaleString('fr-FR')} FCFA`}
        />
        <StatCard
          label="Niveau / Taux"
          value={`${affiliate.tier?.name ?? '—'} · ${(affiliate.commissionRate * 100).toFixed(0)}%`}
        />
      </div>

      {/* Commissions */}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-ticket border border-white/10 bg-navy-mid p-5">
          <p className="text-xs text-bone/50">Commission en attente</p>
          <p className="mt-1 font-display text-2xl text-bone">
            {affiliate.pendingCommission.toLocaleString('fr-FR')} FCFA
          </p>
        </div>
        <div className="rounded-ticket border border-mint/30 bg-mint/10 p-5">
          <p className="text-xs text-mint/80">Commission disponible</p>
          <p className="mt-1 font-display text-2xl text-mint">
            {affiliate.availableCommission.toLocaleString('fr-FR')} FCFA
          </p>
        </div>
      </div>
    </div>
  );
}
