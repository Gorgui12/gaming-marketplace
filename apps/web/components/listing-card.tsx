import Image from 'next/image';
import Link from 'next/link';
import { BadgeCheck, Users } from 'lucide-react';
import type { Listing } from '@gm/types';

export function ListingCard({ listing }: { listing: Listing }) {
  const cover = listing.screenshots[0];

  return (
    <Link
      href={`/marketplace/efootball/${listing.slug}`}
      className="group ticket-notch flex flex-col overflow-hidden rounded-ticket border border-white/10 bg-navy-mid transition hover:border-gold/40"
    >
      <div className="relative aspect-[16/10] bg-navy-deep">
        {cover ? (
          <Image
            src={cover}
            alt={listing.title}
            fill
            sizes="(min-width: 1024px) 320px, (min-width: 640px) 50vw, 100vw"
            className="object-cover transition duration-300 group-hover:scale-[1.04]"
          />
        ) : (
          <div className="flex h-full items-center justify-center font-mono text-xs text-bone/30">
            eFootball
          </div>
        )}
        {listing.moderationStatus === 'APPROVED' ? (
          <span className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-black/60 px-2.5 py-1 text-[11px] font-medium text-emerald-300 backdrop-blur">
            <BadgeCheck size={13} /> Vérifiée
          </span>
        ) : null}
      </div>

      <div className="flex flex-1 flex-col p-4">
        <p className="font-display text-base leading-snug text-bone">{listing.title}</p>

        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-bone/50">
          {typeof listing.teamStrength === 'number' ? (
            <span>Force {listing.teamStrength}</span>
          ) : null}
          {typeof listing.playerCount === 'number' ? (
            <span className="inline-flex items-center gap-1">
              <Users size={12} /> {listing.playerCount} joueurs
            </span>
          ) : null}
        </div>

        <p className="mt-auto pt-3 font-mono text-lg text-gold">
          {listing.price.toLocaleString('fr-FR')} {listing.currency}
        </p>
      </div>
    </Link>
  );
}
