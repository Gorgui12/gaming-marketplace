'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard,
  Users,
  Ticket,
  Megaphone,
  Wallet,
  Gamepad2,
  ClipboardList,
  Scale,
  ArrowLeftRight,
  Newspaper,
  LogOut,
} from 'lucide-react';
import { apiFetch } from '@/lib/api-client';

const NAV_ITEMS = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/games', label: 'Jeux', icon: Gamepad2 },
  { href: '/listings', label: 'Annonces', icon: ClipboardList },
  { href: '/transactions', label: 'Transactions', icon: ArrowLeftRight },
  { href: '/disputes', label: 'Litiges', icon: Scale },
  { href: '/users', label: 'Utilisateurs', icon: Users },
  { href: '/blog', label: 'Blog', icon: Newspaper },
  { href: '/affiliates', label: 'Affiliés', icon: Users },
  { href: '/promo-codes', label: 'Codes promo', icon: Ticket },
  { href: '/affiliate-campaigns', label: 'Campagnes', icon: Megaphone },
  { href: '/affiliate-payouts', label: 'Paiements affiliés', icon: Wallet },
];

export function AdminSidebar() {
  const router = useRouter();
  const pathname = usePathname();

  async function handleLogout() {
    await apiFetch('/api/v1/auth/logout', { method: 'POST' }).catch(() => {});
    router.push('/login');
    router.refresh();
  }

  return (
    <aside className="flex w-56 shrink-0 flex-col border-r border-white/10 bg-navy-deep">
      <div className="px-5 py-5">
        <p className="font-display text-sm tracking-wide text-bone">
          GM<span className="text-gold">ADMIN</span>
        </p>
      </div>
      <nav className="space-y-0.5 px-3">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const active = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm ${
                active
                  ? 'bg-navy-mid text-bone'
                  : 'text-bone/70 hover:bg-navy-mid hover:text-bone'
              }`}
            >
              <Icon className={`h-4 w-4 ${active ? 'text-gold' : ''}`} />
              {label}
            </Link>
          );
        })}
      </nav>
      <div className="mt-auto border-t border-white/10 p-3">
        <button
          type="button"
          onClick={handleLogout}
          className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-bone/70 hover:bg-coral/10 hover:text-coral"
        >
          <LogOut className="h-4 w-4" />
          Déconnexion
        </button>
      </div>
    </aside>
  );
}
