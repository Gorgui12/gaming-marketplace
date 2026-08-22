import Link from 'next/link';
import { Users, Ticket, Megaphone, Wallet, Gamepad2, ClipboardList } from 'lucide-react';

const NAV_ITEMS = [
  { href: '/games', label: 'Jeux', icon: Gamepad2 },
  { href: '/listings', label: 'Annonces', icon: ClipboardList },
  { href: '/affiliates', label: 'Affiliés', icon: Users },
  { href: '/promo-codes', label: 'Codes promo', icon: Ticket },
  { href: '/affiliate-campaigns', label: 'Campagnes', icon: Megaphone },
  { href: '/affiliate-payouts', label: 'Paiements affiliés', icon: Wallet },
];

export function AdminSidebar() {
  return (
    <aside className="w-56 shrink-0 border-r border-white/10 bg-navy-deep">
      <div className="px-5 py-5">
        <p className="font-display text-sm tracking-wide text-bone">
          GM<span className="text-gold">ADMIN</span>
        </p>
      </div>
      <nav className="space-y-0.5 px-3">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-bone/70 hover:bg-navy-mid hover:text-bone"
          >
            <Icon className="h-4 w-4" />
            {label}
          </Link>
        ))}
      </nav>
    </aside>
  );
}
