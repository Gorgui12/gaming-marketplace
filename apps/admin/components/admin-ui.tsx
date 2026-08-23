'use client';

import type { ReactNode } from 'react';

export function StatCard({
  label,
  value,
  hint,
  tone = 'default',
}: {
  label: string;
  value: string | number;
  hint?: string;
  tone?: 'default' | 'gold' | 'mint' | 'coral';
}) {
  const toneClass =
    tone === 'gold'
      ? 'text-gold'
      : tone === 'mint'
        ? 'text-mint'
        : tone === 'coral'
          ? 'text-coral'
          : 'text-bone';
  return (
    <div className="rounded-ticket border border-white/10 bg-navy-mid p-4">
      <p className="text-xs uppercase tracking-wide text-bone/40">{label}</p>
      <p className={`mt-1 font-display text-2xl ${toneClass}`}>{value}</p>
      {hint && <p className="mt-1 text-xs text-bone/40">{hint}</p>}
    </div>
  );
}

/**
 * Graphique en barres vertical en pur SVG — évite une dépendance type
 * recharts pour un besoin simple de visualisation.
 */
export function BarChart({
  data,
  height = 160,
  color = '#E8B84B',
  formatValue,
}: {
  data: { label: string; value: number }[];
  height?: number;
  color?: string;
  formatValue?: (v: number) => string;
}) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const width = Math.max(320, data.length * 34);
  const barArea = height - 28;

  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full" style={{ minWidth: width }}>
        {[0.25, 0.5, 0.75, 1].map((f) => (
          <line
            key={f}
            x1={0}
            x2={width}
            y1={barArea - f * barArea}
            y2={barArea - f * barArea}
            stroke="rgba(245,243,238,0.08)"
          />
        ))}
        {data.map((d, i) => {
          const barW = 20;
          const x = i * 34 + 7;
          const h = (d.value / max) * barArea;
          return (
            <g key={d.label}>
              <rect
                x={x}
                y={barArea - h}
                width={barW}
                height={Math.max(h, d.value > 0 ? 2 : 0)}
                rx={3}
                fill={color}
                opacity={0.85}
              >
                <title>{`${d.label} — ${formatValue ? formatValue(d.value) : d.value}`}</title>
              </rect>
              <text x={x + barW / 2} y={height - 12} textAnchor="middle" fontSize="9" fill="rgba(245,243,238,0.4)">
                {d.label.slice(5)}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/** Barres horizontales de répartition (par statut/état). */
export function BreakdownBars({
  rows,
  color = '#E8B84B',
}: {
  rows: { label: string; value: number }[];
  color?: string;
}) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <div className="space-y-2">
      {rows.map((r) => (
        <div key={r.label} className="flex items-center gap-3 text-xs">
          <span className="w-44 shrink-0 truncate font-mono text-bone/50">{r.label}</span>
          <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-navy-deep">
            <div
              className="h-full rounded-full"
              style={{ width: `${(r.value / max) * 100}%`, backgroundColor: color }}
            />
          </div>
          <span className="w-10 shrink-0 text-right font-mono text-bone">{r.value}</span>
        </div>
      ))}
    </div>
  );
}

export function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-ticket border border-white/10 bg-navy p-4">
      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-bone/50">{title}</p>
      {children}
    </div>
  );
}

export function Pagination({
  page,
  totalPages,
  onChange,
}: {
  page: number;
  totalPages: number;
  onChange: (page: number) => void;
}) {
  if (totalPages <= 1) return null;
  return (
    <div className="mt-4 flex items-center justify-end gap-2 text-sm">
      <button
        disabled={page <= 1}
        onClick={() => onChange(page - 1)}
        className="rounded-full border border-white/15 px-3 py-1.5 text-xs text-bone/70 hover:border-white/30 disabled:opacity-30"
      >
        ← Précédent
      </button>
      <span className="font-mono text-xs text-bone/50">
        {page} / {totalPages}
      </span>
      <button
        disabled={page >= totalPages}
        onClick={() => onChange(page + 1)}
        className="rounded-full border border-white/15 px-3 py-1.5 text-xs text-bone/70 hover:border-white/30 disabled:opacity-30"
      >
        Suivant →
      </button>
    </div>
  );
}

const BADGE_TONES: Record<string, string> = {
  // positif
  COMPLETED: 'bg-mint/15 text-mint',
  PUBLISHED: 'bg-mint/15 text-mint',
  PAID: 'bg-mint/15 text-mint',
  ACTIVE: 'bg-mint/15 text-mint',
  APPROVED: 'bg-mint/15 text-mint',
  AVAILABLE: 'bg-mint/15 text-mint',
  // négatif
  DISPUTED: 'bg-coral/15 text-coral',
  REFUNDED: 'bg-coral/15 text-coral',
  CANCELLED: 'bg-coral/15 text-coral',
  REJECTED: 'bg-coral/15 text-coral',
  BANNED: 'bg-coral/15 text-coral',
  SUSPENDED: 'bg-coral/15 text-coral',
  FAILED: 'bg-coral/15 text-coral',
  OPEN: 'bg-coral/15 text-coral',
  // neutre / attente
  ESCROW_ACTIVE: 'bg-gold/15 text-gold',
  SELLER_DELIVERED: 'bg-gold/15 text-gold',
  BUYER_REVIEWING: 'bg-gold/15 text-gold',
  SELLER_PAYOUT_PENDING: 'bg-gold/15 text-gold',
  PAYMENT_PENDING: 'bg-gold/15 text-gold',
  PENDING_REVIEW: 'bg-gold/15 text-gold',
  PENDING: 'bg-gold/15 text-gold',
  RESERVED: 'bg-gold/15 text-gold',
  CREATED: 'bg-white/10 text-bone/60',
};

export function StatusBadge({ status }: { status: string }) {
  const cls = BADGE_TONES[status] ?? 'bg-white/10 text-bone/60';
  return <span className={`inline-block rounded-full px-2.5 py-1 text-xs font-medium ${cls}`}>{status}</span>;
}
