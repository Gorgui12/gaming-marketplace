'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { LogOut, Menu, X } from 'lucide-react';
import { useCurrentUser } from '@/lib/use-current-user';
import { apiFetch } from '@/lib/api-client';

export function SiteNav() {
  const { user, loading } = useCurrentUser();
  const router = useRouter();
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  // Ferme le menu à chaque changement de page.
  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  // Bloque le scroll du body tant que le menu mobile est ouvert.
  useEffect(() => {
    if (!menuOpen) return;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, [menuOpen]);

  useEffect(() => {
    if (!menuOpen) return;
    const onEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    window.addEventListener('keydown', onEscape);
    return () => window.removeEventListener('keydown', onEscape);
  }, [menuOpen]);

  async function handleLogout() {
    setMenuOpen(false);
    await apiFetch('/api/v1/auth/logout', { method: 'POST' }).catch(() => {});
    router.push('/');
    router.refresh();
  }

  const desktopLinks = (
    <>
      <Link href="/marketplace" className="hover:text-bone">
        Marketplace
      </Link>
      <Link href="/marketplace/efootball" className="hover:text-bone">
        eFootball
      </Link>
      <Link href="/affiliate" className="hover:text-bone">
        Devenir affilié
      </Link>
      {user && (
        <>
          <Link href="/dashboard/buyer" className="hover:text-bone">
            Mes achats
          </Link>
          <Link href="/dashboard/affiliate" className="hover:text-bone">
            Espace affilié
          </Link>
        </>
      )}
    </>
  );

  // Même navigation que le desktop, formatée pour le panneau plein écran.
  const mobileEntries: Array<[string, string]> = [
    ['/marketplace', 'Marketplace'],
    ['/marketplace/efootball', 'eFootball'],
    ['/affiliate', 'Devenir affilié'],
    ...(user
      ? ([
          ['/dashboard/buyer', 'Mes achats'],
          ['/dashboard/seller', 'Espace vendeur'],
          ['/dashboard/affiliate', 'Espace affilié'],
        ] as Array<[string, string]>)
      : []),
  ];

  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-navy-deep/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-5 md:py-4">
        <Link
          href="/"
          className="min-w-0 truncate font-display text-lg tracking-wide text-bone"
          onClick={() => setMenuOpen(false)}
        >
          GAMING<span className="text-gold">MARKET</span>
        </Link>

        {/* Navigation desktop */}
        <nav className="hidden items-center gap-7 text-sm text-bone/70 md:flex">
          {desktopLinks}
        </nav>

        <div className="flex items-center gap-2 sm:gap-3">
          {!loading && user && (
            <Link
              href="/dashboard/seller"
              className="hidden rounded-full border border-white/15 px-4 py-2 text-sm text-bone/90 hover:border-white/30 sm:inline-block"
            >
              Vendre
            </Link>
          )}
          {loading ? null : user ? (
            <button
              onClick={handleLogout}
              className="rounded-full bg-gold px-3.5 py-2 text-sm font-semibold text-navy-deep hover:bg-gold-soft sm:px-4"
            >
              <span className="hidden sm:inline">Déconnexion</span>
              <LogOut size={16} aria-hidden className="sm:hidden" />
              <span className="sr-only sm:hidden">Déconnexion</span>
            </button>
          ) : (
            <>
              <Link href="/login" className="text-sm text-bone/70 hover:text-bone">
                Connexion
              </Link>
              <Link
                href="/register"
                className="whitespace-nowrap rounded-full bg-gold px-3.5 py-2 text-sm font-semibold text-navy-deep hover:bg-gold-soft sm:px-4"
              >
                Créer un compte
              </Link>
            </>
          )}

          {/* Bouton hamburger — mobile uniquement */}
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            aria-expanded={menuOpen}
            aria-controls="mobile-menu"
            aria-label={menuOpen ? 'Fermer le menu' : 'Ouvrir le menu'}
            className="-mr-1 rounded-full p-2 text-bone transition hover:bg-white/10 md:hidden"
          >
            {menuOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
      </div>

      {/* Panneau mobile — ancré juste sous le header, occupe tout l'écran */}
      {menuOpen ? (
        <div
          id="mobile-menu"
          className="absolute inset-x-0 top-full min-h-[calc(100dvh_-_100%)] overflow-y-auto bg-navy-deep px-5 pb-10 pt-4 md:hidden"
        >
          <nav className="flex flex-col divide-y divide-white/10 text-base text-bone/80">
            {mobileEntries.map(([href, label]) => (
              <Link
                key={href}
                href={href}
                className={`py-4 ${pathname === href ? 'text-gold' : ''}`}
              >
                {label}
              </Link>
            ))}
          </nav>

          {!loading && !user ? (
            <div className="mt-10 flex flex-col gap-3">
              <Link
                href="/register"
                className="rounded-full bg-gold py-3 text-center text-sm font-semibold text-navy-deep"
              >
                Créer un compte
              </Link>
              <Link
                href="/login"
                className="rounded-full border border-white/15 py-3 text-center text-sm text-bone"
              >
                Connexion
              </Link>
            </div>
          ) : null}
        </div>
      ) : null}
    </header>
  );
}
