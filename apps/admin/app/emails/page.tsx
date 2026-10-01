'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Eye, FileText, History, Send, TestTube, TriangleAlert } from 'lucide-react';
import { AdminShell } from '@/components/admin-shell';
import { apiFetch } from '@/lib/api-client';
import { Pagination, Panel, StatCard, StatusBadge } from '@/components/admin-ui';

type Kind = 'COMMERCIAL' | 'TRANSACTIONAL';
type Tab = 'compose' | 'history';

/** Un envoi listé dans l'historique. Le corps n'y est pas : voir `EmailSendDetail`. */
interface AdminEmailSend {
  _id: string;
  subject: string;
  kind: Kind;
  status: 'RUNNING' | 'COMPLETED' | 'PARTIAL' | 'FAILED';
  recipientCount: number;
  successCount: number;
  failureCount: number;
  initiatedBy: string;
  lastError?: string | null;
  createdAt: string;
}

/** Le même envoi, corps inclus — Chargé à la demande pour l'affichage. */
interface AdminEmailSendDetail extends AdminEmailSend {
  html: string;
  rawHtml?: string | null;
}

interface RecipientsContext {
  kind: Kind;
  recipientCount: number;
  bulkThreshold: number;
  variables: string[];
}

interface PreviewResult {
  html: string;
  text: string;
  issues: { unknown: string[]; missingUnsubscribe: boolean };
}

const dateFmt = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeStyle: 'short' });

/**
 * Explication affichée à l'écran, pas un commentaire pour le code.
 *
 * Le choix COMMERCIAL / TRANSACTIONAL est le seul point de la page qui engage
 * juridiquement l'envoi, et « commercial » ne veut pas dire la même chose pour
 * tout le monde. L'écran dit noir sur blanc qui reçoit quoi.
 */
const KIND_HELP: Record<Kind, { label: string; help: string }> = {
  COMMERCIAL: {
    label: 'Commercial',
    help:
      'Sollicitation (promo, annonce, actualité). Uniquement aux comptes ayant consenti à la newsletter, email vérifié. Le message doit contenir {{unsubscribeUrl}} et part avec le bouton « Se désabonner » de Gmail.',
  },
  TRANSACTIONAL: {
    label: 'Transactionnel',
    help:
      "Message lié au compte (maintenance, litige, info produit). Va à tous les comptes actifs vérifiés, même désabonnés de la newsletter — quelqu'un qui s'est désinscrit d'un mail promo doit quand même être prévenu d'une coupure. Sans lien de désinscription.",
  },
};

const SAMPLE_HTML = `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
  <h1 style="font-size:20px">Bonjour {{firstName}},</h1>
  <p>
    Nous avons une nouveauté sur <strong>Gaming Marketplace</strong>.
  </p>
  <p><a href="https://exemple.test" style="color:#E8B84B">Découvrir</a></p>
  <p style="font-size:12px;color:#888">
    <a href="{{unsubscribeUrl}}">Se désabonner</a>
  </p>
</div>`;

export default function AdminEmailsPage() {
  const [tab, setTab] = useState<Tab>('compose');

  const [kind, setKind] = useState<Kind>('COMMERCIAL');
  const [subject, setSubject] = useState('');
  const [html, setHtml] = useState('');
  const [testTo, setTestTo] = useState('');

  const [recipients, setRecipients] = useState<RecipientsContext | null>(null);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [previewMode, setPreviewMode] = useState<'html' | 'text'>('html');
  const [previewing, setPreviewing] = useState(false);

  const [busy, setBusy] = useState<'test' | 'send' | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const [history, setHistory] = useState<{
    sends: AdminEmailSend[];
    page: number;
    totalPages: number;
    total: number;
  } | null>(null);
  const [page, setPage] = useState(1);
  const [detail, setDetail] = useState<AdminEmailSendDetail | null>(null);

  const bodyRef = useRef<HTMLTextAreaElement>(null);

  const loadHistory = useCallback(async () => {
    try {
      const res = await apiFetch<{
        sends: AdminEmailSend[];
        page: number;
        totalPages: number;
        total: number;
      }>(`/api/v1/admin/emails/history?page=${page}&pageSize=20`);
      setHistory(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur de chargement');
    }
  }, [page]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  /**
   * Rafraîchit l'historique pendant qu'un envoi est en cours.
   *
   * L'envoi est asynchrone — la route répond 202 et le travail continue dans
   * l'API — donc la seule façon de savoir où il en est est de redemander. Le
   * polling s'arrête dès qu'aucun envoi n'est `RUNNING` : sans cette condition,
   * un onglet laissé ouvert interrogerait l'API toutes les 5 secondes pour la
   * vie de la session.
   */
  useEffect(() => {
    if (!history?.sends.some((s) => s.status === 'RUNNING')) return;
    const id = setInterval(loadHistory, 5000);
    return () => clearInterval(id);
  }, [history, loadHistory]);

  useEffect(() => {
    let cancelled = false;
    apiFetch<RecipientsContext>(`/api/v1/admin/emails/recipients?kind=${kind}`)
      .then((res) => {
        if (!cancelled) setRecipients(res);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Erreur de chargement');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [kind]);

  /**
   * Aperçu débattu.
   *
   * Le délai évite une requête par frappe — l'admin écrit, et le bouton
   * « Aperçu » n'a pas à être actionné à chaque caractère. Il reste assez court
   * pour que la correction soit visible avant qu'on ne passe à autre chose.
   *
   * L'objet n'est ni envoyé ni dépendance : il n'entre dans aucun calcul du
   * rendu, et l'inclure ferait recalculer un aperçu identique à chaque
   * retouche de la ligne d'objet.
   *
   * `cancelled` évite le bug classique du debounce : sans lui, une réponse
   * arrivée après le dernier `setHtml` réécrit l'aperçu avec un corps périmé.
   */
  useEffect(() => {
    if (html.trim() === '') {
      setPreview(null);
      setPreviewing(false);
      return;
    }
    let cancelled = false;
    const id = setTimeout(() => {
      setPreviewing(true);
      apiFetch<PreviewResult>('/api/v1/admin/emails/preview', {
        method: 'POST',
        json: { html, kind },
      })
        .then((res) => {
          if (!cancelled) setPreview(res);
        })
        .catch((err: unknown) => {
          if (!cancelled) {
            setPreview(null);
            setError(err instanceof Error ? err.message : 'Aperçu impossible');
          }
        })
        .finally(() => {
          if (!cancelled) setPreviewing(false);
        });
    }, 700);
    return () => {
      cancelled = true;
      clearTimeout(id);
    };
  }, [html, kind]);

  /** Insère une variable au curseur, pas à la fin du textarea. */
  function insertVariable(name: string) {
    const token = `{{${name}}}`;
    const el = bodyRef.current;
    if (!el) {
      setHtml((h) => `${h}${token}`);
      return;
    }
    const start = el.selectionStart;
    const end = el.selectionEnd;
    setHtml((h) => h.slice(0, start) + token + h.slice(end));
    // Le curseur doit rester après le token inséré, sinon deux insertions
    // successives s'inversent.
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + token.length, start + token.length);
    });
  }

  async function sendTest() {
    const to = testTo.trim().toLowerCase();
    if (!to) {
      setError('Indiquez une adresse email pour le test.');
      return;
    }
    setBusy('test');
    setError('');
    setNotice('');
    try {
      await apiFetch<{ to: string }>('/api/v1/admin/emails/test', {
        method: 'POST',
        json: { to, subject, html, kind },
      });
      setNotice(
        `Test envoyé à ${to}. Vérifiez la mise en page, les liens, et — si c'est commercial — le bouton « Se désabonner ». Ce test n'apparaît pas dans l'historique.`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors du test');
    } finally {
      setBusy(null);
    }
  }

  async function sendBroadcast(confirmedLargeSend: boolean) {
    setBusy('send');
    setError('');
    setNotice('');
    try {
      const res = await apiFetch<{ sendId: string; recipientCount: number }>(
        '/api/v1/admin/emails/send',
        { method: 'POST', json: { subject, html, kind, confirmedLargeSend } },
      );
      setNotice(
        `Envoi lancé à ${res.recipientCount} destinataires. L'envoi est asynchrone : suivez l'avancement dans l'historique.`,
      );
      setPage(1);
      await loadHistory();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors de l\'envoi');
    } finally {
      setBusy(null);
    }
  }

  /**
   * Envoi, avec une porte à deux verrous quand l'audience est large.
   *
   * `confirm()` parce que c'est la convention du back-office (users, listings,
   * disputes) et parce qu'un dialogue natif n'est pas contournable par un
   * double-clic accidentel. Au-delà du seuil configuré côté API, le message
   * rappelle le nombre exact — la seule information qui distingue « j'envoie à
   * 12 testeurs » de « j'envoie à 4 200 personnes », et celle qu'on n'a pas en
   * tête au moment de cliquer.
   */
  function handleSend() {
    const count = recipients?.recipientCount ?? 0;
    if (recipients === null) {
      setError('Destinataires encore en cours de calcul, patientez un instant.');
      return;
    }
    if (count >= recipients.bulkThreshold) {
      const ok = window.confirm(
        `Envoi à ${count} destinataires.\n\n` +
          `Un email parti ne se rattrape pas. Vérifiez que l'objet et l'aperçu sont corrects, puis confirmez.`,
      );
      if (!ok) return;
      void sendBroadcast(true);
      return;
    }
    void sendBroadcast(false);
  }

  async function openDetail(id: string) {
    setError('');
    try {
      const res = await apiFetch<{ send: AdminEmailSendDetail }>(`/api/v1/admin/emails/${id}`);
      setDetail(res.send);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur de chargement');
    }
  }

  const blockingIssues = preview
    ? preview.issues.unknown.length > 0 || preview.issues.missingUnsubscribe
    : false;
  const canSend = subject.trim() !== '' && html.trim() !== '' && !blockingIssues;

  return (
    <AdminShell title="Emails">
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

      {/* Onglets — le composant `Tabs` n'existe pas dans l'admin, la
          convention est une ligne de boutons pilules (cf. sélection de rôles
          sur la page utilisateurs). */}
      <div className="mb-5 flex gap-2">
        <TabButton active={tab === 'compose'} onClick={() => setTab('compose')} icon={<Send className="h-4 w-4" />}>
          Composer
        </TabButton>
        <TabButton active={tab === 'history'} onClick={() => setTab('history')} icon={<History className="h-4 w-4" />}>
          Historique
        </TabButton>
      </div>

      {tab === 'compose' ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard
              label="Destinataires"
              value={recipients?.recipientCount ?? '—'}
              hint={kind === 'COMMERCIAL' ? 'Consentants newsletter' : 'Comptes actifs vérifiés'}
              tone="gold"
            />
            <StatCard
              label="Type d'envoi"
              value={KIND_HELP[kind].label}
              hint={kind === 'COMMERCIAL' ? 'Filtre marketing' : 'Sans filtre marketing'}
            />
            <StatCard
              label="Confirmation"
              value={recipients ? (recipients.recipientCount >= recipients.bulkThreshold ? 'Requis' : 'Non requise') : '—'}
              hint={`Seuil : ${recipients?.bulkThreshold ?? '—'} destinataires`}
              tone={recipients && recipients.recipientCount >= recipients.bulkThreshold ? 'coral' : 'default'}
            />
            <StatCard label="Variables" value={recipients?.variables.length ?? 0} hint="Insérables dans le corps" />
          </div>

          <Panel title="1. Type d'envoi">
            <div className="flex flex-wrap gap-2">
              {(Object.keys(KIND_HELP) as Kind[]).map((k) => (
                <button
                  key={k}
                  onClick={() => setKind(k)}
                  className={`rounded-full px-4 py-2 text-sm disabled:opacity-50 ${
                    kind === k ? 'bg-gold/20 text-gold' : 'bg-white/5 text-bone/50 hover:bg-white/10'
                  }`}
                >
                  {KIND_HELP[k].label}
                </button>
              ))}
            </div>
            <p className="mt-3 text-xs leading-relaxed text-bone/50">{KIND_HELP[kind].help}</p>
          </Panel>

          <Panel title="2. Message">
            <label className="mb-1 block text-xs text-bone/50">Objet</label>
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Ex. Maintenance prévue ce soir à 23h"
              maxLength={200}
              className="w-full rounded-lg border border-white/10 bg-navy-deep px-3 py-2 text-sm text-bone outline-none focus:border-gold"
            />

            <label className="mb-1 mt-4 block text-xs text-bone/50">Corps (HTML)</label>
            <textarea
              ref={bodyRef}
              value={html}
              onChange={(e) => setHtml(e.target.value)}
              rows={14}
              spellCheck={false}
              placeholder="<div>Bonjour {{firstName}}, …</div>"
              className="w-full rounded-lg border border-white/10 bg-navy-deep px-3 py-2 font-mono text-xs text-bone outline-none focus:border-gold"
            />

            {recipients && recipients.variables.length > 0 ? (
              <div className="mt-3">
                <p className="mb-1.5 text-xs text-bone/50">
                  Insérer une variable au curseur — chaque destinataire reçoit la sienne.
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {recipients.variables.map((v) => (
                    <button
                      key={v}
                      onClick={() => insertVariable(v)}
                      className="rounded-full bg-white/5 px-2.5 py-1 font-mono text-[11px] text-bone/70 hover:bg-gold/20 hover:text-gold"
                    >
                      {`{{${v}}}`}
                    </button>
                  ))}
                </div>
              </div>
            ) : html.trim() === '' ? (
              <button
                onClick={() => setHtml(SAMPLE_HTML)}
                className="mt-3 rounded-full border border-white/15 px-3 py-1.5 text-xs text-bone/60 hover:border-white/30"
              >
                Partir d&apos;un exemple
              </button>
            ) : null}
          </Panel>

          <Panel title="3. Aperçu">
            <div className="mb-3 flex items-center gap-2">
              <button
                onClick={() => setPreviewMode('html')}
                className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs ${
                  previewMode === 'html' ? 'bg-gold/20 text-gold' : 'bg-white/5 text-bone/50'
                }`}
              >
                <Eye className="h-3.5 w-3.5" />
                Rendu visuel
              </button>
              <button
                onClick={() => setPreviewMode('text')}
                className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs ${
                  previewMode === 'text' ? 'bg-gold/20 text-gold' : 'bg-white/5 text-bone/50'
                }`}
              >
                <FileText className="h-3.5 w-3.5" />
                Version texte
              </button>
              {previewing && <span className="text-xs text-bone/30">Calcul…</span>}
            </div>

            {!html.trim() ? (
              <p className="text-sm text-bone/50">Écrivez un corps pour voir le rendu.</p>
            ) : !preview ? (
              <p className="text-sm text-bone/50">Aperçu en cours…</p>
            ) : previewMode === 'text' ? (
              <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded-lg border border-white/10 bg-navy-deep p-3 font-mono text-xs leading-relaxed text-bone/70">
                {preview.text}
              </pre>
            ) : (
              // `sandbox` sans valeur : aucun script, aucune origine partagée avec
              // l'admin. Le HTML vient d'un textarea et la désinfection retire
              // déjà `script` et `on*`, mais une iframe sandboxée est la seule
              // garantie qui ne dépende pas de la regex.
              <iframe
                title="Aperçu de l'email"
                sandbox=""
                srcDoc={preview.html}
                className="h-96 w-full rounded-lg border border-white/10 bg-white"
              />
            )}

            {preview?.issues.unknown.length ? (
              <p className="mt-3 rounded-lg border border-coral/30 bg-coral/10 px-3 py-2 text-xs text-coral">
                Variable(s) inconnue(s) : {preview.issues.unknown.join(', ')}. L'envoi sera refusé —
                seules les variables listées ci-dessus sont acceptées.
              </p>
            ) : null}
            {preview?.issues.missingUnsubscribe ? (
              <p className="mt-2 rounded-lg border border-coral/30 bg-coral/10 px-3 py-2 text-xs text-coral">
                Un envoi commercial doit contenir{' '}
                <code className="font-mono">{'{{unsubscribeUrl}}'}</code> : sans lien de
                désinscription, le message n'a pas d'issue pour le lecteur, et Gmail comme Resend le
                traitent comme du spam non sollicité.
              </p>
            ) : null}
          </Panel>

          <Panel title="4. Envoyer">
            <p className="mb-3 text-xs text-bone/50">
              L'envoi part en arrière-plan et l'API répond immédiatement. Un envoi ne peut pas être
              annulé une fois parti, ni relancé sans créer un second envoi.
            </p>

            <div className="mb-4 rounded-lg border border-white/10 bg-navy-mid p-4">
              <p className="mb-2 text-xs text-bone/50">
                D'abord un test sur une adresse que vous contrôlez — de préférence celle d'un compte
                inscrit à la newsletter si l'envoi est commercial.
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
                  disabled={busy !== null || html.trim() === ''}
                  className="flex items-center gap-2 rounded-full bg-gold/20 px-4 py-2 text-sm text-gold hover:bg-gold/30 disabled:opacity-50"
                >
                  <TestTube className="h-4 w-4" />
                  {busy === 'test' ? 'Envoi…' : 'Envoyer le test'}
                </button>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={handleSend}
                disabled={busy !== null || !canSend}
                className="flex items-center gap-2 rounded-full bg-coral px-5 py-2.5 text-sm font-semibold text-bone hover:bg-coral/80 disabled:opacity-40"
              >
                <Send className="h-4 w-4" />
                {busy === 'send'
                  ? 'Lancement…'
                  : `Envoyer à ${recipients?.recipientCount ?? '…'} destinataire${
                      recipients && recipients.recipientCount > 1 ? 's' : ''
                    }`}
              </button>
              {recipients && recipients.recipientCount >= recipients.bulkThreshold && (
                <span className="flex items-center gap-1.5 text-xs text-coral">
                  <TriangleAlert className="h-3.5 w-3.5" />
                  Audience large : une confirmation sera demandée.
                </span>
              )}
            </div>
            {!canSend && html.trim() !== '' && blockingIssues && (
              <p className="mt-3 text-xs text-bone/40">
                Corrigez les points signalés dans l'aperçu pour débloquer l'envoi.
              </p>
            )}
          </Panel>
        </div>
      ) : (
        <Panel title="Historique des envois">
          {!history ? (
            <p className="text-sm text-bone/50">Chargement…</p>
          ) : history.sends.length === 0 ? (
            <p className="text-sm text-bone/60">
              Aucun envoi pour le moment. Le premier message rédigé depuis cette page apparaîtra ici,
              avec le corps exact qui est parti.
            </p>
          ) : (
            <div className="space-y-2">
              {history.sends.map((s) => (
                <button
                  key={s._id}
                  onClick={() => openDetail(s._id)}
                  className="flex w-full flex-wrap items-center justify-between gap-3 border-b border-white/5 py-2.5 text-left last:border-0 hover:bg-white/5"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm text-bone">{s.subject}</span>
                      <StatusBadge status={s.status} />
                      <StatusBadge status={s.kind} />
                    </div>
                    <p className="mt-0.5 font-mono text-xs text-bone/40">
                      {dateFmt.format(new Date(s.createdAt))} · {s.recipientCount} destinataires ·
                      déclenché par {s.initiatedBy}
                    </p>
                    {s.lastError && <p className="mt-1 font-mono text-xs text-coral/70">{s.lastError}</p>}
                  </div>
                  <div className="flex shrink-0 items-center gap-3 font-mono text-xs">
                    <span className="text-mint">{s.successCount} ✓</span>
                    {s.failureCount > 0 && <span className="text-coral">{s.failureCount} ✗</span>}
                    {s.status === 'RUNNING' && <span className="text-gold">en cours…</span>}
                  </div>
                </button>
              ))}
            </div>
          )}
          {history && (
            <Pagination page={history.page} totalPages={history.totalPages} onChange={setPage} />
          )}
        </Panel>
      )}

      {detail && (
        <SendDetailDrawer send={detail} onClose={() => setDetail(null)} />
      )}
    </AdminShell>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm ${
        active ? 'bg-gold/20 text-gold' : 'bg-white/5 text-bone/50 hover:bg-white/10'
      }`}
    >
      {icon}
      {children}
    </button>
  );
}

/**
 * Détail d'un envoi : ce qui est vraiment parti.
 *
 * Le corps est affiché tel qu'il a été désinfecté ET, quand il diffère, le corps
 * d'origine — sans la différence, impossible de comprendre ce qu'un passage en
 * production a retiré, ni de vérifier qu'il n'a pas retiré trop.
 */
function SendDetailDrawer({
  send,
  onClose,
}: {
  send: AdminEmailSendDetail;
  onClose: () => void;
}) {
  const bodyChanged =
    send.rawHtml !== null && send.rawHtml !== undefined && send.rawHtml !== send.html;

  return (
    <div className="fixed inset-0 z-50 flex justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <div
        className="relative flex h-full w-full max-w-3xl flex-col overflow-y-auto bg-navy-deep shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-white/10 bg-navy-deep px-6 py-4">
          <div className="min-w-0 flex-1">
            <h2 className="truncate font-display text-lg text-bone">{send.subject}</h2>
            <div className="mt-1 flex items-center gap-2">
              <StatusBadge status={send.status} />
              <StatusBadge status={send.kind} />
              <span className="font-mono text-xs text-bone/40">
                {dateFmt.format(new Date(send.createdAt))}
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="shrink-0 rounded-full border border-white/15 px-3 py-1.5 text-xs text-bone/60 hover:border-white/30"
          >
            Fermer
          </button>
        </div>

        <div className="space-y-5 px-6 py-5">
          <div className="grid grid-cols-3 gap-3">
            <StatCard label="Destinataires" value={send.recipientCount} />
            <StatCard label="Envoyés" value={send.successCount} tone="mint" />
            <StatCard
              label="Échecs"
              value={send.failureCount}
              tone={send.failureCount > 0 ? 'coral' : 'default'}
            />
          </div>

          {send.lastError && (
            <p className="rounded-lg border border-coral/30 bg-coral/10 px-3 py-2 font-mono text-xs text-coral">
              {send.lastError}
            </p>
          )}

          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-bone/50">
              Rendu parti
            </p>
            <iframe
              title="Email envoyé"
              sandbox=""
              srcDoc={send.html}
              className="h-96 w-full rounded-lg border border-white/10 bg-white"
            />
          </div>

          {bodyChanged && (
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-bone/50">
                Corps d'origine — la désinfection a modifié quelque chose
              </p>
              <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-lg border border-white/10 bg-navy-mid p-3 font-mono text-xs text-bone/60">
                {send.rawHtml}
              </pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
