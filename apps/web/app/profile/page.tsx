'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Pencil } from 'lucide-react';
import { SiteNav } from '@/components/site-nav';
import { SiteFooter } from '@/components/site-footer';
import { apiFetch } from '@/lib/api-client';
import { useCurrentUser } from '@/lib/use-current-user';

interface MyProfile {
  _id: string;
  email: string;
  phone?: string;
  firstName: string;
  lastName: string;
  username: string;
  avatar?: string;
  country: string;
  currency: string;
  roles: string[];
  emailVerified: boolean;
  sellerStatus: 'NONE' | 'PENDING' | 'VERIFIED' | 'REJECTED';
  reputation: { average: number; count: number };
  transactionCount: number;
  successfulSales: number;
  successfulPurchases: number;
  createdAt: string;
}

const PLACEHOLDER_AVATAR = 'https://www.gravatar.com/avatar/00000000000000000000000000000000?d=mp&f=y';

export default function ProfilePage() {
  const { user, loading: authLoading } = useCurrentUser();
  const [profile, setProfile] = useState<MyProfile | null>(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<{
    firstName: string;
    lastName: string;
    phone: string;
    avatar: string;
    country: string;
    currency: string;
  } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    if (!user) return;
    apiFetch<{ user: MyProfile }>('/api/v1/users/me')
      .then((d) => {
        setProfile(d.user);
        setForm({
          firstName: d.user.firstName,
          lastName: d.user.lastName,
          phone: d.user.phone ?? '',
          avatar: d.user.avatar ?? '',
          country: d.user.country,
          currency: d.user.currency,
        });
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Erreur de chargement'));
  }, [user]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!form) return;
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const data = await apiFetch<{ user: MyProfile }>('/api/v1/users/me', {
        method: 'PATCH',
        json: {
          firstName: form.firstName,
          lastName: form.lastName,
          phone: form.phone || undefined,
          avatar: form.avatar || undefined,
          country: form.country,
          currency: form.currency,
        },
      });
      setProfile(data.user);
      setEditing(false);
      setSuccess('Profil mis à jour');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors de la mise à jour');
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <SiteNav />
      <main className="mx-auto max-w-3xl px-5 pb-16 pt-8 md:pt-12">
        <div className="flex items-center justify-between">
          <h1 className="font-display text-2xl text-bone">Mon profil</h1>
          {profile && !editing && (
            <button
              onClick={() => setEditing(true)}
              className="flex items-center gap-1.5 rounded-full border border-white/15 px-4 py-2 text-xs text-bone/70 hover:border-white/30"
            >
              <Pencil size={13} />
              Modifier
            </button>
          )}
        </div>

        {error && <p className="mt-4 text-sm text-coral">{error}</p>}
        {success && <p className="mt-4 text-sm text-mint">{success}</p>}

        {!authLoading && !user ? (
          <div className="mt-8 rounded-ticket border border-white/10 bg-navy-mid p-10 text-center">
            <p className="font-display text-lg text-bone">Connectez-vous pour voir votre profil</p>
            <Link
              href="/login"
              className="mt-6 inline-block rounded-full bg-gold px-5 py-2.5 text-sm font-semibold text-navy-deep hover:bg-gold-soft"
            >
              Se connecter
            </Link>
          </div>
        ) : !profile ? (
          <p className="mt-6 text-sm text-bone/50">Chargement…</p>
        ) : (
          <div className="mt-6 rounded-ticket border border-white/10 bg-navy-mid p-6">
            <div className="flex items-center gap-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={profile.avatar || PLACEHOLDER_AVATAR}
                alt=""
                className="h-16 w-16 shrink-0 rounded-full border border-white/10 object-cover"
              />
              <div className="min-w-0">
                <h2 className="truncate font-display text-xl text-bone">
                  {profile.firstName} {profile.lastName}
                </h2>
                <p className="truncate text-sm text-bone/50">
                  @{profile.username}
                  {profile.emailVerified ? ' · Email vérifié' : ' · Email non vérifié'}
                </p>
              </div>
              {profile.sellerStatus === 'VERIFIED' && (
                <span className="ml-auto shrink-0 rounded-full bg-mint/15 px-3 py-1 text-xs font-medium text-mint">
                  Vendeur vérifié
                </span>
              )}
            </div>

            {!editing ? (
              <>
                <dl className="mt-6 grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
                  <ProfileItem label="Email" value={profile.email} mono />
                  <ProfileItem label="Téléphone" value={profile.phone || '—'} mono />
                  <ProfileItem label="Pays" value={profile.country} />
                  <ProfileItem label="Devise" value={profile.currency} />
                  <ProfileItem
                    label="Membre depuis"
                    value={new Date(profile.createdAt).toLocaleDateString('fr-FR')}
                  />
                  <ProfileItem
                    label="Statut vendeur"
                    value={
                      profile.sellerStatus === 'NONE'
                        ? 'Compte simple'
                        : profile.sellerStatus === 'VERIFIED'
                          ? 'Vérifié'
                          : profile.sellerStatus === 'PENDING'
                            ? 'En attente de vérification'
                            : 'Rejeté'
                    }
                  />
                </dl>

                <div className="mt-6 grid grid-cols-3 gap-3 border-t border-white/10 pt-5 text-center">
                  <Stat value={profile.reputation.count > 0 ? profile.reputation.average.toFixed(1) : '—'} label="Note" />
                  <Stat value={String(profile.transactionCount)} label="Transactions" />
                  <Stat value={String(profile.successfulSales)} label="Ventes réussies" />
                </div>

                <div className="mt-6 flex flex-wrap gap-2 border-t border-white/10 pt-5">
                  {profile.sellerStatus === 'VERIFIED' && (
                    <Link
                      href={`/seller/${profile.username}`}
                      className="rounded-full border border-white/15 px-4 py-2 text-xs text-bone/70 hover:border-white/30"
                    >
                      Voir mon profil public
                    </Link>
                  )}
                </div>
              </>
            ) : form ? (
              <form onSubmit={handleSave} className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Prénom">
                  <input
                    required
                    value={form.firstName}
                    onChange={(e) => setForm({ ...form, firstName: e.target.value })}
                    className={inputClass}
                  />
                </Field>
                <Field label="Nom">
                  <input
                    required
                    value={form.lastName}
                    onChange={(e) => setForm({ ...form, lastName: e.target.value })}
                    className={inputClass}
                  />
                </Field>
                <Field label="Téléphone">
                  <input
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    placeholder="+221 77 000 00 00"
                    className={inputClass}
                  />
                </Field>
                <Field label="Avatar (URL)">
                  <input
                    value={form.avatar}
                    onChange={(e) => setForm({ ...form, avatar: e.target.value })}
                    placeholder="https://…"
                    className={inputClass}
                  />
                </Field>
                <Field label="Pays (code ISO)">
                  <input
                    required
                    maxLength={2}
                    value={form.country}
                    onChange={(e) => setForm({ ...form, country: e.target.value.toUpperCase() })}
                    placeholder="SN"
                    className={inputClass}
                  />
                </Field>
                <Field label="Devise (code ISO)">
                  <input
                    required
                    maxLength={3}
                    value={form.currency}
                    onChange={(e) => setForm({ ...form, currency: e.target.value.toUpperCase() })}
                    placeholder="XOF"
                    className={inputClass}
                  />
                </Field>

                <div className="flex items-center gap-2 sm:col-span-2">
                  <button
                    type="submit"
                    disabled={saving}
                    className="rounded-full bg-gold px-6 py-2.5 text-sm font-semibold text-navy-deep hover:bg-gold-soft disabled:opacity-60"
                  >
                    {saving ? 'Enregistrement…' : 'Enregistrer'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEditing(false);
                      setForm({
                        firstName: profile.firstName,
                        lastName: profile.lastName,
                        phone: profile.phone ?? '',
                        avatar: profile.avatar ?? '',
                        country: profile.country,
                        currency: profile.currency,
                      });
                    }}
                    className="rounded-full border border-white/15 px-6 py-2.5 text-sm text-bone/70"
                  >
                    Annuler
                  </button>
                </div>
              </form>
            ) : null}
          </div>
        )}
      </main>
      <SiteFooter />
    </>
  );
}

const inputClass =
  'w-full rounded-lg border border-white/10 bg-navy-deep px-3 py-2 text-sm text-bone outline-none focus:border-gold';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-bone/50">
        {label}
      </span>
      {children}
    </label>
  );
}

function ProfileItem({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-bone/40">{label}</dt>
      <dd className={`mt-0.5 text-sm text-bone/80 ${mono ? 'font-mono' : ''}`}>{value}</dd>
    </div>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <p className="font-display text-lg text-bone">{value}</p>
      <p className="text-xs text-bone/50">{label}</p>
    </div>
  );
}