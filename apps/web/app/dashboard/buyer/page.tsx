'use client';

import { useEffect, useState } from 'react';
import { SiteNav } from '@/components/site-nav';
import { SiteFooter } from '@/components/site-footer';
import { apiFetch } from '@/lib/api-client';
import { useCurrentUser } from '@/lib/use-current-user';
import { ReviewForm } from '@/components/review-form';
import { TransactionChat } from '@/components/transaction-chat';

interface MyTransaction {
  _id: string;
  buyer: string;
  seller: string;
  amount: number;
  currency: string;
  escrowStatus: string;
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
const ACCESS_VISIBLE_STATES = ['SELLER_DELIVERED', 'BUYER_REVIEWING', 'COMPLETED'];

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
            {myPurchases.map((t) => (
              <div key={t._id} className="rounded-ticket border border-white/10 bg-navy-mid p-4">
                <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
                  <p className="font-mono text-sm text-gold">
                    {t.amount.toLocaleString('fr-FR')} {t.currency}
                  </p>
                  <span className="max-w-full rounded-full bg-white/10 px-2.5 py-1 text-xs leading-snug text-bone/70">
                    {STATUS_LABEL[t.escrowStatus] ?? t.escrowStatus}
                  </span>
                </div>

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

                {!['CANCELLED', 'REFUNDED'].includes(t.escrowStatus) && user && (
                  <TransactionChat transactionId={t._id} currentUserId={user.id} />
                )}
              </div>
            ))}
          </div>
        )}
      </main>
      <SiteFooter />
    </>
  );
}