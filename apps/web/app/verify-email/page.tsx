'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { apiFetch } from '@/lib/api-client';
import { notifyAuthChanged } from '@/lib/use-current-user';
import { SiteNav } from '@/components/site-nav';

function VerifyEmailView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token');

  const [status, setStatus] = useState<'idle' | 'verifying' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!token || status !== 'idle') return;
    setStatus('verifying');
    apiFetch('/api/v1/auth/verify-email', {
      method: 'POST',
      json: { token },
    })
      .then(() => {
        setStatus('success');
        notifyAuthChanged();
      })
      .catch((err) => {
        setStatus('error');
        setMessage(err instanceof Error ? err.message : 'Lien de confirmation invalide ou expiré.');
      });
  }, [token, status]);

  // Pas de token : l'utilisateur vient de s'inscrire, on l'invite à
  // vérifier sa boîte mail (et surtout ses courriers indésirables).
  if (!token) {
    return (
      <>
        <SiteNav />
        <main className="mx-auto flex min-h-[70vh] max-w-md flex-col justify-center px-5 py-16">
          <div className="rounded-2xl border border-gold/30 bg-navy-mid p-6">
            <h1 className="font-display text-2xl text-bone">
              Vérifiez votre boîte mail
            </h1>
            <p className="mt-4 text-sm leading-relaxed text-bone/70">
              Un email de confirmation vous a été envoyé. Cliquez sur le
              bouton <strong className="text-bone">« Confirmer mon email »</strong> de ce
              message pour activer votre compte.
            </p>
            <div className="mt-6 rounded-xl bg-navy-deep p-4">
              <p className="text-sm font-semibold text-gold">
                Vous ne trouvez pas l'email ?
              </p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-bone/70">
                <li>Vérifiez le dossier <strong className="text-bone">courrier indésirable / spam</strong>.</li>
                <li>
                  Sur iPhone (Mail / iCloud) et Gmail, cet email peut arriver en
                  spam ou dans les onglets <strong className="text-bone">Promotions</strong>{' '}
                  / <strong className="text-bone">Mises à jour</strong>.
                </li>
                <li>Marquez notre email comme <strong className="text-bone">non indésirable</strong> pour ne rien rater.</li>
                <li>Le lien de confirmation expire dans 24 heures.</li>
              </ul>
            </div>
            <div className="mt-8 flex flex-col gap-3">
              <Link
                href="/marketplace"
                className="w-full rounded-full bg-gold px-6 py-2.5 text-center text-sm font-semibold text-navy-deep hover:bg-gold-soft"
              >
                Explorer la marketplace
              </Link>
              <p className="text-center text-xs text-bone/50">
                Vous pouvez continuer à parcourir le site pendant que votre
                email est vérifié.
              </p>
            </div>
          </div>
        </main>
      </>
    );
  }

  return (
    <>
      <SiteNav />
      <main className="mx-auto flex min-h-[70vh] max-w-md flex-col justify-center px-5 py-16">
        <div className="rounded-2xl border border-gold/30 bg-navy-mid p-6 text-center">
          {status === 'verifying' && (
            <>
              <h1 className="font-display text-2xl text-bone">Confirmation…</h1>
              <p className="mt-4 text-sm text-bone/70">
                Vérification de votre adresse email en cours.
              </p>
            </>
          )}

          {status === 'success' && (
            <>
              <h1 className="font-display text-2xl text-bone">
                Email confirmé !
              </h1>
              <p className="mt-4 text-sm leading-relaxed text-bone/70">
                Votre adresse email a bien été vérifiée. Vous pouvez maintenant
                acheter et vendre sur Gaming Marketplace en toute sérénité.
              </p>
              <button
                onClick={() => {
                  router.push('/marketplace');
                  router.refresh();
                }}
                className="mt-6 w-full rounded-full bg-gold px-6 py-2.5 text-sm font-semibold text-navy-deep hover:bg-gold-soft"
              >
                Aller à la marketplace
              </button>
            </>
          )}

          {status === 'error' && (
            <>
              <h1 className="font-display text-2xl text-bone">
                Lien de confirmation invalide
              </h1>
              <p className="mt-4 text-sm leading-relaxed text-coral">{message}</p>
              <p className="mt-2 text-sm text-bone/50">
                Ce lien a peut-être expiré (24 h). Contactez le support à
                support@gamingmarket.store pour recevoir un nouveau lien.
              </p>
              <Link
                href="/marketplace"
                className="mt-6 block w-full rounded-full bg-gold px-6 py-2.5 text-center text-sm font-semibold text-navy-deep hover:bg-gold-soft"
              >
                Retour à la marketplace
              </Link>
            </>
          )}
        </div>
      </main>
    </>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense>
      <VerifyEmailView />
    </Suspense>
  );
}