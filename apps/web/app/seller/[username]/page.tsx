import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Star } from 'lucide-react';
import { SiteNav } from '@/components/site-nav';
import { SiteFooter } from '@/components/site-footer';
import { apiFetch } from '@/lib/api-client';

interface SellerProfile {
  _id: string;
  username: string;
  firstName: string;
  avatar?: string;
  country: string;
  reputation: { average: number; count: number };
  transactionCount: number;
  successfulSales: number;
  sellerStatus: string;
  createdAt: string;
}

interface SellerReview {
  _id: string;
  rating: number;
  comment?: string;
  createdAt: string;
}

async function getSellerProfile(username: string): Promise<SellerProfile | null> {
  try {
    const data = await apiFetch<{ user: SellerProfile }>(`/api/v1/users/${username}`);
    return data.user;
  } catch {
    return null;
  }
}

async function getSellerReviews(userId: string): Promise<SellerReview[]> {
  try {
    const data = await apiFetch<{ reviews: SellerReview[] }>(`/api/v1/reviews/user/${userId}`);
    return data.reviews;
  } catch {
    return [];
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ username: string }>;
}): Promise<Metadata> {
  const { username } = await params;
  const profile = await getSellerProfile(username);
  if (!profile) return {};
  return {
    title: `${profile.firstName} (@${profile.username}) — Vendeur vérifié`,
    description: `Profil vendeur de ${profile.firstName} sur Gaming Market — ${profile.successfulSales} ventes réussies, note moyenne ${profile.reputation.average}/5.`,
  };
}

function StarsDisplay({ rating }: { rating: number }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          size={16}
          className={n <= Math.round(rating) ? 'fill-gold text-gold' : 'fill-transparent text-bone/30'}
        />
      ))}
    </div>
  );
}

export default async function SellerProfilePage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;
  const profile = await getSellerProfile(username);
  if (!profile) notFound();

  const reviews = await getSellerReviews(profile._id);

  return (
    <>
      <SiteNav />
      <main className="mx-auto max-w-3xl px-5 pb-16 pt-8 md:pt-12">
        <div className="rounded-ticket border border-white/10 bg-navy-mid p-6">
          <div className="flex items-center gap-4">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-gold/15 font-display text-xl text-gold">
              {profile.firstName.charAt(0).toUpperCase()}
            </div>
            <div>
              <h1 className="font-display text-xl text-bone">{profile.firstName}</h1>
              <p className="text-sm text-bone/50">@{profile.username}</p>
            </div>
            {profile.sellerStatus === 'VERIFIED' && (
              <span className="ml-auto shrink-0 rounded-full bg-mint/15 px-3 py-1 text-xs font-medium text-mint">
                Vendeur vérifié
              </span>
            )}
          </div>

          <div className="mt-6 grid grid-cols-3 gap-3 text-center">
            <div>
              <p className="font-display text-lg text-bone">
                {profile.reputation.count > 0 ? profile.reputation.average.toFixed(1) : '—'}
              </p>
              <p className="text-xs text-bone/50">Note moyenne</p>
            </div>
            <div>
              <p className="font-display text-lg text-bone">{profile.reputation.count}</p>
              <p className="text-xs text-bone/50">Avis</p>
            </div>
            <div>
              <p className="font-display text-lg text-bone">{profile.successfulSales}</p>
              <p className="text-xs text-bone/50">Ventes réussies</p>
            </div>
          </div>
        </div>

        <h2 className="mt-10 font-display text-lg text-bone">Avis reçus</h2>
        {reviews.length === 0 ? (
          <p className="mt-4 text-sm text-bone/50">Aucun avis pour l&apos;instant.</p>
        ) : (
          <div className="mt-4 space-y-3">
            {reviews.map((r) => (
              <div key={r._id} className="rounded-ticket border border-white/10 bg-navy-mid p-4">
                <StarsDisplay rating={r.rating} />
                {r.comment && <p className="mt-2 text-sm text-bone/70">{r.comment}</p>}
                <p className="mt-2 text-xs text-bone/40">
                  {new Date(r.createdAt).toLocaleDateString('fr-FR')}
                </p>
              </div>
            ))}
          </div>
        )}
      </main>
      <SiteFooter />
    </>
  );
}
