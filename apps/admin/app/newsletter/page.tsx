'use client';

import { useCallback, useEffect, useState } from 'react';
import { Eye, Send } from 'lucide-react';
import { AdminShell } from '@/components/admin-shell';
import { apiFetch } from '@/lib/api-client';
import { Panel, Pagination, StatusBadge, StatCard } from '@/components/admin-ui';

interface Campaign {
  _id: string;
  key: string;
  status: string;
  recipientCount: number;
  successCount: number;
  failureCount: number;
  listingIds: string[];
  initiatedBy: string;
  lastError?: string | null;
  createdAt: string;
}

interface PreviewListing {
  id: string;
  title: string;
  slug: string;
  price: string;
  currency: string;
  gameName: string;
  country: string;
  views: number;
}

const dateFmt = new Intl.DateTimeFormat('fr-FR', {
  dateStyle: 'short',
  timeStyle: 'short',
});

export default function AdminNewsletterPage() {
  const [history, setHistory] = useState<{
    campaigns: Campaign[];
    page: number;
    totalPages: number;
  } | null>(null);
  const [preview, setPreview] = useState<{
    listings: PreviewListing[];
    recipientCount: number;
    key: string;
  } | null>(null);
  const [page, setPage] = useState(1);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [testTo, setTestTo] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [hist, prev] = await Promise.all([
        apiFetch<{ campaigns: Campaign[]; page: number; totalPages: number }>(
          `/api/v1/admin/newsletter/history?page=${page}&pageSize=20`,
        ),
        apiFetch<{ listings: PreviewListing[]; recipientCount: number; key: string }>(
          '/api/v1/admin/newsletter/preview',
        ),
      ]);
      setHistory(hist);
      setPreview(prev);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur de chargement');
    }
  }, [page]);

  useEffect(() => {
    load();
  }, [load]);

  async function sendTest() {
    const to = testTo.trim().toLowerCase();
    if (!to) {
      setError('Indiquez une adresse email.');
      return;
    }
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const res = await apiFetch<{ to: string; listingCount: number }>(
        '/api/v1/admin/newsletter/test',
        { method: 'POST', json: { to } },
      );
      setNotice(
        `Test envoyé à ${res.to} avec ${res.listingCount} annonces. Vérifiez la réception et le bouton « Se désabonner ».`,
      );
      setTestTo('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors du test');
    } finally {
      setBusy(false);
    }
  }

  return (
    <AdminShell title="Newsletter">
      {error && (
        <div className="mb-4 rounded-ticket border border-coral/30 bg-coral/10 p-3 text-sm text-coral">
          {error}
        </div>
      )}
      {notice && (
        <div className="mb-4 rounded-ticket border border-mint/30 bg-mint/10 p-3 text-sm text-mint">
          {notice}
        </div>
      )}

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Abonnés"
          value={preview?.recipientCount ?? 0}
          hint="Consentants, email vérifié"
          tone="gold"
        />
        <StatCard
          label="Envois"
          value={history?.campaigns.length ?? 0}
          hint="Sur la page courante"
        />
        <StatCard
          label="Prochaine période"
          value={preview?.key ?? '—'}
          hint="Clé d'idempotence"
        />
        <StatCard
          label="Envois échoués"
          value={history?.campaigns.reduce((a, c) => a + c.failureCount, 0) ?? 0}
          hint="Cumul page courante"
          tone={history && history.campaigns.some((c) => c.failureCount > 0) ? 'coral' : 'default'}
        />
      </div>

      <div className="space-y-4">
        <Panel title="Sélection en cours (ce qui partirait maintenant)">
          {!preview ? (
            <p className="text-sm text-bone/50">Chargement…</p>
          ) : preview.listings.length === 0 ? (
            <p className="text-sm text-bone/60">
              Aucune annonce ne remplit les critères pour l&apos;instant. Le classement exige des
              annonces publiées, récentes, et au-dessus du seuil de vues configuré
              (<code className="font-mono text-bone/40">NEWSLETTER_MIN_VIEWS</code>).
            </p>
          ) : (
            <ol className="space-y-2">
              {preview.listings.map((l, i) => (
                <li
                  key={l.id}
                  className="flex items-center justify-between gap-3 border-b border-white/5 py-2 last:border-0"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="rounded-full bg-gold/20 px-2 py-0.5 font-mono text-xs text-gold">
                        {i + 1}
                      </span>
                      <span className="truncate text-sm text-bone">{l.title}</span>
                    </div>
                    <p className="mt-0.5 pl-8 text-xs text-bone/40">
                      {l.gameName} · {l.country} · {l.views} vues
                    </p>
                  </div>
                  <span className="shrink-0 font-mono text-sm text-bone">
                    {l.price} {l.currency}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </Panel>

        <Panel title="Envoyer un test">
          <p className="mb-3 text-xs text-bone/50">
            Utilise exactement le même rendu et les mêmes en-têtes que l&apos;envoi réel, y compris
            le lien de désinscription. L&apos;adresse doit appartenir à un compte ayant consenti à
            la newsletter, avec son email vérifié.
          </p>
          <div className="flex flex-wrap gap-2">
            <input
              type="email"
              value={testTo}
              onChange={(e) => setTestTo(e.target.value)}
              placeholder="mon-email@exemple.com"
              className="flex-1 rounded-lg border border-white/10 bg-navy-deep px-3 py-2 text-sm text-bone outline-none focus:border-gold/50"
            />
            <button
              onClick={sendTest}
              disabled={busy}
              className="flex items-center gap-2 rounded-full bg-gold/20 px-4 py-2 text-sm text-gold hover:bg-gold/30 disabled:opacity-50"
            >
              <Send className="h-4 w-4" />
              {busy ? 'Envoi…' : 'Envoyer le test'}
            </button>
          </div>
          <p className="mt-3 text-xs text-bone/40">
            L&apos;envoi à toute la liste n&apos;est volontairement pas disponible ici : il passe par
            le cron externe, donc par une décision explicite de modifier la fréquence. Un bouton
            « envoyer à tous » serait une arme de confusion — un double-clic et la newsletter est
            partie à toute la base, sans retour possible.
          </p>
        </Panel>

        <Panel title="Historique des envois">
          {!history ? (
            <p className="text-sm text-bone/50">Chargement…</p>
          ) : history.campaigns.length === 0 ? (
            <p className="text-sm text-bone/60">
              Aucun envoi pour le moment. La première campagne apparaîtra ici.
            </p>
          ) : (
            <div className="space-y-2">
              {history.campaigns.map((c) => (
                <div
                  key={c._id}
                  className="flex flex-wrap items-center justify-between gap-3 border-b border-white/5 py-2.5 last:border-0"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs text-bone/70">{c.key}</span>
                      <StatusBadge status={c.status} />
                    </div>
                    <p className="mt-0.5 text-xs text-bone/40">
                      {dateFmt.format(new Date(c.createdAt))} · {c.recipientCount} destinataires ·{' '}
                      {c.listingIds.length} annonces · déclenché par {c.initiatedBy}
                    </p>
                    {c.lastError && (
                      <p className="mt-1 font-mono text-xs text-coral/70">
                        {c.lastError}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-3 font-mono text-xs">
                    <span className="text-mint">{c.successCount} ✓</span>
                    {c.failureCount > 0 && <span className="text-coral">{c.failureCount} ✗</span>}
                    <span className="flex items-center gap-1 text-bone/40">
                      <Eye className="h-3.5 w-3.5" />
                      {c.listingIds.length}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
          {history && (
            <Pagination page={history.page} totalPages={history.totalPages} onChange={setPage} />
          )}
        </Panel>
      </div>
    </AdminShell>
  );
}
