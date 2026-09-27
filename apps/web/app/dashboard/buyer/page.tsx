'use client';

import { useEffect, useState } from 'react';
import { SiteNav } from '@/components/site-nav';
import { SiteFooter } from '@/components/site-footer';
import { apiFetch } from '@/lib/api-client';
import { useCurrentUser } from '@/lib/use-current-user';
import { ReviewForm } from '@/components/review-form';
import { TransactionChat } from '@/components/transaction-chat';
import { DisputeForm } from '@/components/dispute-form';

interface MyTransaction {
  _id: string;
  buyer: string;
  seller: string;
  amount: number;
  currency: string;
  escrowStatus: string;
}

interface MyDispute {
  _id: string;
  transaction: string | { _id: string };
  reason: string;
  description: string;
  status: string;
  resolution?: string;
  createdAt: string;
}

const STATUS_LABEL: Record<string, string> = {
  CREATED: 'Créée',
  PAYMENT_PENDING: 'Paiement en attente',
  PAYMENT_CONFIRMED: 'Paiement confirmé',
  ESCROW_ACTIVE: 'En attente que le vendeur livre les accès',
  SELLER_DELIVERED: 'Accès livrés',
  BUYER_REVIEWING: 'À vous de confirmer',
  DISPUTED: 'En litige',
  COMPLETED: 'Terminée',
  REFUNDED: 'Remboursée',
  CANCELLED: 'Annulée',
};

// États où les accès ont potentiellement été libérés et peuvent être relus.
// DISPUTED en est volontairement absent : pendant un litige, l'API retire le
// droit de relecture (getForBuyer rejette l'état), le bouton ne doit donc pas
// laisser croire que les accès sont consultables.
const ACCESS_VISIBLE_STATES = ['SELLER_DELIVERED', 'BUYER_REVIEWING', 'COMPLETED'];

// États dans lesquels l'acheteur peut encore contester : le séquestre est
// actif et l'accès n'est pas encore validé par lui. On n'ouvre pas de litige
// sur une transaction terminée (il n'y a plus rien à trancher) ni sur une
// transaction en litige ou déjà soldée.
const DISPUTABLE_STATES = ['ESCROW_ACTIVE', 'SELLER_DELIVERED', 'BUYER_REVIEWING'];

const DISPUTE_STATUS_LABEL: Record<string, string> = {
  OPEN: 'En cours d\'examen',
  UNDER_REVIEW: 'En cours d\'examen',
  WAITING_FOR_BUYER: 'En attente de votre réponse',
  WAITING_FOR_SELLER: 'En attente du vendeur',
  RESOLVED_BUYER: 'Tranché en votre faveur — vous êtes remboursé',
  RESOLVED_SELLER: 'Tranché en faveur du vendeur',
  CLOSED: 'Clos',
};

const DISPUTE_REASON_LABEL: Record<string, string> = {
  ACCESS_INCORRECT: 'Les accès fournis ne correspondent pas à l\'annonce',
  ACCOUNT_MISMATCH: 'Le compte reçu n\'est pas celui annoncé',
  SELLER_UNRESPONSIVE: 'Le vendeur ne répond plus',
  ACCOUNT_INACCESSIBLE: 'Le compte est inaccessible',
  MAJOR_ISSUE: 'Problème majeur',
  OTHER: 'Autre motif',
};

export default function BuyerDashboardPage() {
  const { user } = useCurrentUser();
  const [transactions, setTransactions] = useState<MyTransaction[] | null>(null);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [revealedId, setRevealedId] = useState<string | null>(null);
  const [credentials, setCredentials] = useState<Record<string, string>>({});
  const [loadingAccess, setLoadingAccess] = useState<string | null>(null);
  const [reviewedTransactionIds, setReviewedTransactionIds] = useState<Set<string>>(new Set());
  const [showReviewForm, setShowReviewForm] = useState<string | null>(null);
  const [disputes, setDisputes] = useState<MyDispute[]>([]);
  const [showDisputeForm, setShowDisputeForm] = useState<string | null>(null);

  async function loadDisputes() {
    try {
      const d = await apiFetch<{ disputes: MyDispute[] }>('/api/v1/disputes/mine');
      setDisputes(d.disputes);
    } catch {
      // Non bloquant : l'utilisateur voit ses transactions même si la liste
      // des litiges échoue. L'API refusera toute ouverture en double.
      setDisputes([]);
    }
  }

  async function load() {
    try {
      const d = await apiFetch<{ transactions: MyTransaction[] }>('/api/v1/transactions/mine');

      // Filet de sécurité: si l'IPN PayDunya ne nous est jamais parvenu
      // (tunnel coupé, latence), on interroge activement leur API pour les
      // paiements encore en attente — notamment au retour de la page de
      // paiement, où l'acheteur est redirigé ici. UNIQUEMENT mes achats :
      // /mine renvoie aussi mes ventes, et l'API refuse la vérification
      // aux non-acheteurs (403).
      const pending = d.transactions.filter(
        (t) => t.escrowStatus === 'PAYMENT_PENDING' && t.buyer === user?.id,
      );
      if (pending.length > 0) {
        await Promise.allSettled(
          pending.map((t) =>
            apiFetch(`/api/v1/transactions/${t._id}/verify-payment`, { method: 'POST' }),
          ),
        );
        const refreshed = await apiFetch<{ transactions: MyTransaction[] }>(
          '/api/v1/transactions/mine',
        );
        setTransactions(refreshed.transactions);
        return;
      }

      setTransactions(d.transactions);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur de chargement');
    }
  }

  async function loadMyReviews() {
    try {
      const d = await apiFetch<{ reviews: Array<{ transaction: string }> }>('/api/v1/reviews/mine');
      setReviewedTransactionIds(new Set(d.reviews.map((r) => r.transaction)));
    } catch {
      // non bloquant : au pire le formulaire d'avis réapparaît même si déjà
      // laissé, l'API refuserait alors le doublon proprement.
    }
  }

  useEffect(() => {
    // Attendre que l'utilisateur soit chargé avant de vérifier les paiements
    // en attente : le filtre ci-dessous compare t.buyer à user.id — lancé
    // trop tôt, user vaut encore undefined et aucun appel verify-payment
    // ne partait jamais (les paiements restaient bloqués en "en attente").
    if (user === undefined) return;
    void load();
    void loadMyReviews();
    void loadDisputes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  async function confirm(id: string) {
    setBusyId(id);
    try {
      await apiFetch(`/api/v1/transactions/${id}/confirm`, {
        method: 'POST',
        json: { transactionId: id },
      });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setBusyId(null);
    }
  }

  async function revealAccess(id: string) {
    if (credentials[id]) {
      setRevealedId(revealedId === id ? null : id);
      return;
    }
    setLoadingAccess(id);
    setError('');
    try {
      const data = await apiFetch<{ credentials: string }>(`/api/v1/transactions/${id}/access`);
      setCredentials((c) => ({ ...c, [id]: data.credentials }));
      setRevealedId(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Impossible de récupérer les accès");
    } finally {
      setLoadingAccess(null);
    }
  }

  const myPurchases = user ? transactions?.filter((t) => t.buyer === user.id) : transactions;

  // Litige portant sur une transaction donnée, le plus récent en premier.
  function disputeFor(transactionId: string): MyDispute | undefined {
    return disputes.find(
      (d) => String(typeof d.transaction === 'string' ? d.transaction : d.transaction?._id) === transactionId,
    );
  }

  return (
    <>
      <SiteNav />
      <main className="mx-auto max-w-4xl px-5 pb-16 pt-8 md:pt-12">
        <h1 className="font-display text-2xl text-bone">Mes achats</h1>
        {error && <p className="mt-4 text-sm text-coral">{error}</p>}
        {!myPurchases ? (
          <p className="mt-6 text-sm text-bone/50">Chargement…</p>
        ) : myPurchases.length === 0 ? (
          <p className="mt-6 text-sm text-bone/50">Aucun achat pour l'instant.</p>
        ) : (
          <div className="mt-6 space-y-3">
            {myPurchases.map((t) => {
              const dispute = disputeFor(t._id);
              return (
              <div key={t._id} className="rounded-ticket border border-white/10 bg-navy-mid p-4">
                <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
                  <p className="font-mono text-sm text-gold">
                    {t.amount.toLocaleString('fr-FR')} {t.currency}
                  </p>
                  <span className="max-w-full rounded-full bg-white/10 px-2.5 py-1 text-xs leading-snug text-bone/70">
                    {STATUS_LABEL[t.escrowStatus] ?? t.escrowStatus}
                  </span>
                </div>

                {dispute && (
                  <div className="mt-3 rounded-lg border border-coral/30 bg-navy-deep p-3">
                    <p className="text-xs text-coral">
                      Litige ouvert le{' '}
                      {new Date(dispute.createdAt).toLocaleDateString('fr-FR')} —{' '}
                      {DISPUTE_STATUS_LABEL[dispute.status] ?? dispute.status}
                    </p>
                    <p className="mt-1 text-xs text-bone/60">
                      Motif : {DISPUTE_REASON_LABEL[dispute.reason] ?? dispute.reason}
                    </p>
                    {dispute.resolution && (
                      <p className="mt-2 rounded border border-white/10 bg-navy-mid px-2 py-1.5 text-xs text-mint">
                        Décision : {dispute.resolution}
                      </p>
                    )}
                    <p className="mt-2 text-[11px] text-bone/40">
                      Pendant l&apos;examen du dossier, le montant reste bloqué et
                      les accès du compte ne sont plus consultables.
                    </p>
                  </div>
                )}

                {ACCESS_VISIBLE_STATES.includes(t.escrowStatus) && (
                  <div className="mt-3">
                    <button
                      disabled={loadingAccess === t._id}
                      onClick={() => revealAccess(t._id)}
                      className="rounded-full border border-gold/40 px-4 py-2 text-xs text-gold hover:bg-gold/10 disabled:opacity-50"
                    >
                      {loadingAccess === t._id
                        ? 'Chargement…'
                        : revealedId === t._id
                          ? 'Masquer les accès'
                          : 'Voir les accès du compte'}
                    </button>
                    {revealedId === t._id && credentials[t._id] && (
                      <pre className="mt-2 overflow-x-auto whitespace-pre-wrap rounded-lg border border-gold/30 bg-navy-deep p-3 font-mono text-xs text-bone">
                        {credentials[t._id]}
                      </pre>
                    )}
                  </div>
                )}

                {t.escrowStatus === 'BUYER_REVIEWING' && (
                  <button
                    disabled={busyId === t._id}
                    onClick={() => confirm(t._id)}
                    className="mt-3 w-full rounded-full bg-mint/15 px-4 py-2.5 text-xs text-mint hover:bg-mint/25 disabled:opacity-50 sm:w-auto sm:py-2"
                  >
                    Confirmer la réception du compte
                  </button>
                )}

                {t.escrowStatus === 'COMPLETED' && !reviewedTransactionIds.has(t._id) && (
                  showReviewForm === t._id ? (
                    <ReviewForm
                      transactionId={t._id}
                      onSubmitted={() => {
                        setReviewedTransactionIds((s) => new Set(s).add(t._id));
                        setShowReviewForm(null);
                      }}
                    />
                  ) : (
                    <button
                      onClick={() => setShowReviewForm(t._id)}
                      className="mt-3 rounded-full border border-gold/40 px-4 py-2 text-xs text-gold hover:bg-gold/10"
                    >
                      Laisser un avis
                    </button>
                  )
                )}

                {showDisputeForm === t._id && (
                  <DisputeForm
                    transactionId={t._id}
                    onOpened={() => {
                      setShowDisputeForm(null);
                      void loadDisputes();
                      void load();
                    }}
                    onCancel={() => setShowDisputeForm(null)}
                  />
                )}

                {!dispute && DISPUTABLE_STATES.includes(t.escrowStatus) && (
                  <button
                    onClick={() =>
                      setShowDisputeForm(showDisputeForm === t._id ? null : t._id)
                    }
                    className="mt-3 rounded-full border border-coral/40 px-4 py-2 text-xs text-coral hover:bg-coral/10"
                  >
                    {showDisputeForm === t._id
                      ? 'Masquer le formulaire'
                      : 'Ouvrir un litige'}
                  </button>
                )}

                {!['CANCELLED', 'REFUNDED'].includes(t.escrowStatus) && user && (
                  <TransactionChat transactionId={t._id} currentUserId={user.id} />
                )}
              </div>
              );
            })}
          </div>
        )}
      </main>
      <SiteFooter />
    </>
  );
}