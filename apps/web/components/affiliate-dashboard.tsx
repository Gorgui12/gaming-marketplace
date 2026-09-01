'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api-client';
import { Copy, Check } from 'lucide-react';

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
}

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
      {/* Actions principales — visibles immédiatement (§35) */}
      <div className="grid gap-3 sm:grid-cols-2">
        <CopyField label="Votre lien" value={link} />
        <CopyField label="Votre code de parrainage" value={affiliate.affiliateCode} />
      </div>
      <p className="text-xs text-bone/40">
        Partagez votre lien : chaque achat effectué dans les {affiliate.cookieDurationDays} jours
        suivant un clic vous est automatiquement attribué. Votre code de parrainage est la partie
        unique du lien — pas un code de réduction à part entière.
      </p>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Clics" value={affiliate.totalClicks.toLocaleString('fr-FR')} />
        <StatCard label="Conversions" value={affiliate.totalConversions.toLocaleString('fr-FR')} />
        <StatCard
          label="CA généré"
          value={`${affiliate.totalRevenue.toLocaleString('fr-FR')} FCFA`}
        />
        <StatCard
          label="Taux de commission"
          value={`${(affiliate.commissionRate * 100).toFixed(0)}%`}
        />
      </div>

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
