import Link from 'next/link';

export function SiteFooter() {
  return (
    <footer className="border-t border-white/10 bg-navy-deep">
      <div className="mx-auto max-w-6xl px-5 py-10 text-sm text-bone/50">
        <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="font-display text-bone/80">
              GAMING<span className="text-gold">MARKET</span>
            </p>
            <p className="mt-2 max-w-xs text-bone/40">
              Tiers de confiance entre acheteurs et vendeurs de comptes gaming en Afrique de
              l&apos;Ouest.
            </p>
          </div>
          <div className="flex gap-12">
            <div>
              <p className="mb-2 font-medium text-bone/70">Marketplace</p>
              <ul className="space-y-1">
                <li>
                  <Link href="/marketplace/efootball" className="hover:text-bone/80">
                    Comptes eFootball
                  </Link>
                </li>
                <li>
                  <Link href="/affiliate" className="hover:text-bone/80">
                    Devenir affilié
                  </Link>
                </li>
              </ul>
            </div>
          </div>
        </div>
        <p className="mt-8 text-xs text-bone/30">
          La vente de comptes gaming peut être soumise aux conditions d&apos;utilisation des
          éditeurs. Vérifiez le statut de chaque jeu avant toute transaction.
        </p>
      </div>
    </footer>
  );
}
