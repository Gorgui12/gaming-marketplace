'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Check, Loader2, Mail } from 'lucide-react';
import { apiFetch } from '@/lib/api-client';
import { notifyAuthChanged, useCurrentUser } from '@/lib/use-current-user';

/**
 * Formulaire d'inscription a la newsletter, dans le pied de page.
 *
 * Visible UNIQUEMENT pour un utilisateur connecte. C'est un choix produit
 * autant que juridique : on n'envoie rien a quelqu'un qui n'a pas de compte, donc
 * pas de table de leads parallele, pas de consentement « en bas de page »
 * accumule pour une liste qu'on ne saura pas nettoyer. Le pied de page est un
 * bon endroit pour rappeler l'existant, pas pour convertir un visiteur.
 *
 * Le consentement reste par ailleurs accessible dans Mon profil : ce widget est
 * un raccourci, pas le seul point d'entrée.
 */
export function NewsletterSignup() {
  const { user, loading } = useCurrentUser();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (loading || !user) return null;

  const optedIn = user.marketing?.optedIn === true;

  async function toggle() {
    setBusy(true);
    setError('');
    try {
      await apiFetch('/api/v1/users/me', {
        method: 'PATCH',
        json: { marketingOptIn: !optedIn },
      });
      // Sans ça, la case resterait décochée après inscription et un
      // re-clic enverrait `true` au lieu de `false` : l'utilisateur se
      // retrouverait désinscrit en croyant s'être inscrit.
      notifyAuthChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="text-bone/50">
      <p className="mb-2 font-medium text-bone/70">Newsletter</p>

      {optedIn ? (
        <div>
          <p className="flex items-center gap-1.5 text-xs">
            <Check className="h-3.5 w-3.5 text-mint" />
            Les 5 comptes les plus consultés, chaque semaine.
          </p>
          <button
            type="button"
            onClick={toggle}
            disabled={busy}
            className="mt-2 text-xs text-bone/40 underline underline-offset-2 hover:text-bone/70 disabled:opacity-50"
          >
            {busy ? 'Mise à jour…' : 'Se désinscrire'}
          </button>
        </div>
      ) : (
        <div>
          <p className="text-xs">
            Recevez les 5 comptes les plus consultés, sans spam.
          </p>
          <button
            type="button"
            onClick={toggle}
            disabled={busy}
            className="mt-2 flex items-center gap-1.5 rounded-full border border-white/15 px-3 py-1.5 text-xs text-bone/70 hover:border-white/30 hover:text-bone disabled:opacity-50"
          >
            {busy ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Mail className="h-3.5 w-3.5" />
            )}
            S&apos;inscrire
          </button>
        </div>
      )}

      {error && <p className="mt-2 text-xs text-coral">{error}</p>}

      <p className="mt-3 text-xs text-bone/30">
        Gérable aussi dans{' '}
        <Link href="/profile" className="underline underline-offset-2 hover:text-bone/60">
          Mon profil
        </Link>
        .
      </p>
    </div>
  );
}
