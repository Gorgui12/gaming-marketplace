'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { SiteNav } from '@/components/site-nav';
import { SiteFooter } from '@/components/site-footer';
import { apiFetch } from '@/lib/api-client';
import { useCurrentUser } from '@/lib/use-current-user';
import { TransactionChat } from '@/components/transaction-chat';
import { ShareActions } from '@/components/share-actions';

interface MyListing {
  _id: string;
  title: string;
  slug: string;
  price: number;
  currency: string;
  status: string;
  moderationStatus: string;
  views: number;
  shareCount?: number;
}

interface MySale {
  _id: string;
  buyer: string;
  seller: string;
  amount: number;
  currency: string;
  escrowStatus: string;
  platformFee?: number;
  sellerAmount?: number;
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

const LISTING_STATUS_LABEL: Record<string, { label: string; color: string }> = {
  DRAFT: { label: 'Brouillon', color: 'bg-white/10 text-bone/50' },
  PENDING_REVIEW: { label: "En attente d'approbation", color: 'bg-gold/15 text-gold' },
  PUBLISHED: { label: 'Publiée', color: 'bg-mint/15 text-mint' },
  RESERVED: { label: 'Réservée', color: 'bg-gold/15 text-gold' },
  SOLD: { label: 'Vendue', color: 'bg-mint/15 text-mint' },
  REJECTED: { label: 'Rejetée', color: 'bg-coral/15 text-coral' },
  SUSPENDED: { label: 'Suspendue', color: 'bg-coral/15 text-coral' },
  ARCHIVED: { label: 'Archivée', color: 'bg-white/10 text-bone/50' },
};

const SALE_STATUS_LABEL: Record<string, string> = {
  ESCROW_ACTIVE: 'Paiement reçu — livrez les accès',
  SELLER_DELIVERED: 'Accès livrés — en attente de confirmation acheteur',
  BUYER_REVIEWING: "En attente de confirmation acheteur",
  COMPLETED: 'Terminée — vous serez payé',
  DISPUTED: 'En litige',
  REFUNDED: 'Remboursée',
};

const DISPUTE_STATUS_LABEL: Record<string, string> = {
  OPEN: 'En cours d\'examen par notre équipe',
  UNDER_REVIEW: 'En cours d\'examen par notre équipe',
  WAITING_FOR_BUYER: 'En attente de la réponse de l\'acheteur',
  WAITING_FOR_SELLER: 'En attente de votre réponse',
  RESOLVED_BUYER: 'Tranché en faveur de l\'acheteur — remboursement',
  RESOLVED_SELLER: 'Tranché en votre faveur — vous êtes payé',
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

export default function SellerDashboardPage() {
  const { user, loading } = useCurrentUser();
  const [listings, setListings] = useState<MyListing[] | null>(null);
  const [sales, setSales] = useState<MySale[] | null>(null);
  const [disputes, setDisputes] = useState<MyDispute[]>([]);
  const [error, setError] = useState('');
  const [deliveringId, setDeliveringId] = useState<string | null>(null);
  const [credentials, setCredentials] = useState('');
  const [submitting, setSubmitting] = useState(false);

  function load() {
    apiFetch<{ listings: MyListing[] }>('/api/v1/listings/mine')
      .then((d) => setListings(d.listings))
      .catch((err) => setError(err instanceof Error ? err.message : 'Erreur de chargement'));
    apiFetch<{ transactions: MySale[] }>('/api/v1/transactions/mine')
      .then((d) => setSales(d.transactions))
      .catch(() => {});
    // Litiges ouverts par l'acheteur sur mes ventes : le vendeur doit voir
    // le motif et pouvoir répondre dans la messagerie, sinon il découvre
    // l'instruction du paiement à l'établissement de son relevé.
    apiFetch<{ disputes: MyDispute[] }>('/api/v1/disputes/mine')
      .then((d) => setDisputes(d.disputes))
      .catch(() => {});
  }

  useEffect(load, []);

  // Ne garder que les transactions où JE suis le vendeur.
  const mySales = user ? sales?.filter((t) => t.seller === user.id) : sales;

  function disputeFor(transactionId: string): MyDispute | undefined {
    return disputes.find(
      (d) => String(typeof d.transaction === 'string' ? d.transaction : d.transaction?._id) === transactionId,
    );
  }

  async function handleDeliver(transactionId: string) {
    if (!credentials.trim()) {
      setError('Merci de renseigner les identifiants du compte avant de livrer.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      await apiFetch(`/api/v1/transactions/${transactionId}/deliver`, {
        method: 'POST',
        json: { transactionId, credentialsPayload: credentials },
      });
      setDeliveringId(null);
      setCredentials('');
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors de la livraison');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <SiteNav />
      <main className="mx-auto max-w-4xl px-5 pb-16 pt-8 md:pt-12">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="font-display text-2xl text-bone">Mes annonces</h1>
          <Link
            href="/dashboard/seller/listings/new"
            className="rounded-full bg-gold px-5 py-3 text-center text-sm font-semibold text-navy-deep hover:bg-gold-soft sm:py-2.5"
          >
            + Créer une annonce
          </Link>
        </div>

        {error && <p className="mt-4 text-sm text-coral">{error}</p>}

        {/* Non connecté : on affiche l'invite de connexion au lieu du vide,
            sinon l'utilisateur croit que son compte vendeur n'existe pas. */}
        {!loading && !user ? (
          <div className="mt-8 rounded-ticket border border-white/10 bg-navy-mid p-10 text-center">
            <p className="font-display text-lg text-bone">Connectez-vous pour vendre</p>
            <p className="mt-2 text-sm text-bone/60">
              Créez votre annonce après vous être connecté à votre compte.
            </p>
            <Link
              href="/login"
              className="mt-6 inline-block rounded-full bg-gold px-5 py-2.5 text-sm font-semibold text-navy-deep hover:bg-gold-soft"
            >
              Se connecter
            </Link>
          </div>
        ) : !listings || listings.length === 0 ? (
          <div className="mt-8 rounded-ticket border border-white/10 bg-navy-mid p-10 text-center">
            <p className="font-display text-lg text-bone">Aucune annonce pour l'instant</p>
          </div>
        ) : (
          <div className="mt-6 space-y-3">
            {listings.map((l) => (
              <div key={l._id} className="rounded-ticket border border-white/10 bg-navy-mid p-4">
                <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
                  <p className="min-w-0 flex-1 font-display text-base leading-snug text-bone">{l.title}</p>
                  <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs ${LISTING_STATUS_LABEL[l.status]?.color ?? 'bg-white/10 text-bone/50'}`}>
                    {LISTING_STATUS_LABEL[l.status]?.label ?? l.status}
                  </span>
                </div>
                <p className="mt-1 font-mono text-sm text-gold">
                  {l.price.toLocaleString('fr-FR')} {l.currency}
                </p>

                {/* Partage réservé aux annonces publiées : partager une
                    brouillon ou une annonce en attente d'approbation envoie un
                    lien qui répond 404, et le vendeur conclut que la
                    plateforme est cassée. */}
                {l.status === 'PUBLISHED' ? (
                  <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-white/10 pt-3">
                    <ShareActions
                      slug={l.slug}
                      title={l.title}
                      price={l.price}
                      currency={l.currency}
                      shareCount={l.shareCount}
                      onCounted={(count) =>
                        setListings((prev) =>
                          prev?.map((x) => (x._id === l._id ? { ...x, shareCount: count } : x)) ?? null,
                        )
                      }
                    />
                    <p className="text-[11px] text-bone/40">
                      {l.views} vue{l.views > 1 ? 's' : ''}
                      {l.shareCount
                        ? ` · ${l.shareCount} partage${l.shareCount > 1 ? 's' : ''}`
                        : ' · pas encore partagé'}
                    </p>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        )}

        {/* Ventes en cours — c'est ICI que le vendeur renseigne les
            identifiants du compte (Konami / eFootball) pour livrer à
            l'acheteur, une fois le paiement confirmé (ESCROW_ACTIVE). */}
        <h2 className="mt-12 font-display text-2xl text-bone">Mes ventes</h2>
        {!mySales || mySales.length === 0 ? (
          <p className="mt-4 text-sm text-bone/50">Aucune vente en cours.</p>
        ) : (
          <div className="mt-6 space-y-3">
            {mySales.map((s) => {
              const dispute = disputeFor(s._id);
              return (
              <div key={s._id} className="rounded-ticket border border-white/10 bg-navy-mid p-4">
                <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
                  <p className="font-mono text-sm text-gold">
                    {s.amount.toLocaleString('fr-FR')} {s.currency}
                  </p>
                  <span className="max-w-full rounded-full bg-white/10 px-2.5 py-1 text-xs leading-snug text-bone/70">
                    {SALE_STATUS_LABEL[s.escrowStatus] ?? s.escrowStatus}
                  </span>
                </div>

                {dispute && (
                  <div className="mt-3 rounded-lg border border-coral/30 bg-navy-deep p-3">
                    <p className="text-xs text-coral">
                      Litige ouvert par l&apos;acheteur le{' '}
                      {new Date(dispute.createdAt).toLocaleDateString('fr-FR')} —{' '}
                      {DISPUTE_STATUS_LABEL[dispute.status] ?? dispute.status}
                    </p>
                    <p className="mt-1 text-xs text-bone/60">
                      Motif : {DISPUTE_REASON_LABEL[dispute.reason] ?? dispute.reason}
                    </p>
                    <p className="mt-1 text-xs text-bone/50">
                      Son argumentation : {dispute.description}
                    </p>
                    {dispute.resolution && (
                      <p className="mt-2 rounded border border-white/10 bg-navy-mid px-2 py-1.5 text-xs text-mint">
                        Décision : {dispute.resolution}
                      </p>
                    )}
                    <p className="mt-2 text-[11px] text-bone/40">
                      Le paiement reste bloqué jusqu&apos;à la décision. Si le
                      litige vous paraît infondé, répondez dans la messagerie
                      ci-dessous avec vos arguments.
                    </p>
                  </div>
                )}

                {s.platformFee != null && s.sellerAmount != null && (
                  <div className="mt-3 space-y-1 rounded-lg border border-white/10 bg-navy-deep p-3 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-bone/60">Prix de vente</span>
                      <span className="font-mono text-bone">
                        {s.amount.toLocaleString('fr-FR')} {s.currency}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-bone/60">Commission plateforme</span>
                      <span className="font-mono text-coral">
                        −{s.platformFee.toLocaleString('fr-FR')} {s.currency}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2 border-t border-white/10 pt-1.5">
                      <span className="text-mint">Net reçu</span>
                      <span className="font-mono font-semibold text-mint">
                        {s.sellerAmount.toLocaleString('fr-FR')} {s.currency}
                      </span>
                    </div>
                  </div>
                )}

                {s.escrowStatus === 'ESCROW_ACTIVE' && (
                  deliveringId === s._id ? (
                    <div className="mt-3 space-y-2">
                      <textarea
                        rows={4}
                        placeholder="Identifiant, mot de passe, email associé... tout ce qu'il faut pour récupérer le compte"
                        value={credentials}
                        onChange={(e) => setCredentials(e.target.value)}
                        className="w-full rounded-lg border border-white/10 bg-navy-deep px-3 py-2 text-sm text-bone outline-none focus:border-gold"
                      />
                      <div className="flex gap-2">
                        <button
                          disabled={submitting}
                          onClick={() => handleDeliver(s._id)}
                          className="rounded-full bg-mint/15 px-4 py-2 text-xs text-mint hover:bg-mint/25 disabled:opacity-50"
                        >
                          {submitting ? 'Envoi…' : 'Livrer les accès'}
                        </button>
                        <button
                          onClick={() => setDeliveringId(null)}
                          className="rounded-full border border-white/15 px-4 py-2 text-xs text-bone/70"
                        >
                          Annuler
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => setDeliveringId(s._id)}
                      className="mt-3 rounded-full bg-gold px-4 py-2 text-xs font-semibold text-navy-deep hover:bg-gold-soft"
                    >
                      Livrer les accès du compte
                    </button>
                  )
                )}

                {!['CANCELLED', 'REFUNDED'].includes(s.escrowStatus) && user && (
                  <TransactionChat transactionId={s._id} currentUserId={user.id} />
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