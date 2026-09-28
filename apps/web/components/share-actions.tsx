'use client';

import { useEffect, useState } from 'react';
import { Check, Copy, Share2 } from 'lucide-react';
import { apiFetch } from '@/lib/api-client';
import { getOrCreateTrackingSessionId } from '@/lib/tracking-session';
import {
  canNativeShare,
  copyToClipboard,
  facebookShareUrl,
  isShareAbort,
  listingShareMessage,
  listingSharePath,
  whatsappShareUrl,
  type ListingShareInfo,
  type ShareChannel,
} from '@/lib/share';

interface ShareActionsProps extends ListingShareInfo {
  /** Compteur connu au rendu, permet d'afficher le total sans aller le chercher. */
  shareCount?: number;
  /** `row` = boutons discrets alignés ; `button` = bouton unique ouvrant un
   *  menu, prévu pour la barre fixe en bas de l'écran (le menu s'ouvre vers le
   *  haut pour ne pas être coupé). */
  variant?: 'row' | 'button';
  onCounted?: (shareCount: number) => void;
  className?: string;
}

const CHANNEL_STYLE: Record<Exclude<ShareChannel, 'native'>, string> = {
  whatsapp: 'bg-emerald-600/90 hover:bg-emerald-600',
  facebook: 'bg-blue-600/90 hover:bg-blue-600',
  copy: 'bg-white/10 hover:bg-white/20',
};

const CHANNEL_ICON: Record<Exclude<ShareChannel, 'native'>, string> = {
  whatsapp: '💬',
  facebook: '📘',
  copy: '📋',
};

const CHANNEL_LABEL: Record<Exclude<ShareChannel, 'native'>, string> = {
  whatsapp: 'WhatsApp',
  facebook: 'Facebook',
  copy: 'Copier le lien',
};

/**
 * Partage d'une annonce.
 *
 * Le compteur est incrémenté en tâche de fond et ne doit jamais bloquer ni
 * faire échouer le partage lui-même : une erreur réseau ne doit pas empêcher
 * quelqu'un d'envoyer le lien sur WhatsApp. Réciproquement, `window.open` est
 * appelé de façon synchrone dans le gestionnaire de clic, sinon les navigateurs
 * le bloquent comme fenêtre surgissante.
 */
export function ShareActions({
  slug,
  title,
  price,
  currency,
  gameSlug,
  shareCount,
  variant = 'row',
  onCounted,
  className = '',
}: ShareActionsProps) {
  const [origin, setOrigin] = useState('');
  const [copied, setCopied] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [nativeAvailable, setNativeAvailable] = useState(false);

  useEffect(() => {
    setOrigin(window.location.origin);
    setNativeAvailable(canNativeShare());
  }, []);

  const link = origin ? `${origin}${listingSharePath({ slug, title, price, currency, gameSlug })}` : '';

  function reportShare(channel: ShareChannel) {
    // Le compteur n'est pas critique : une session de tracking indisponible
    // (cookies bloqués) ne doit pas faire perdre le partage.
    void apiFetch<{ counted: boolean; shareCount: number }>(
      `/api/v1/listings/${slug}/share`,
      { method: 'POST', json: { channel, sessionId: getOrCreateTrackingSessionId() } },
    )
      .then((data) => {
        if (data.counted) onCounted?.(data.shareCount);
      })
      .catch(() => {});
  }

  async function share(channel: ShareChannel) {
    setMenuOpen(false);
    if (!link) return;
    const message = listingShareMessage({ slug, title, price, currency, gameSlug }, link);

    if (channel === 'whatsapp' || channel === 'facebook') {
      const url = channel === 'whatsapp' ? whatsappShareUrl(message) : facebookShareUrl(message, link);
      window.open(url, '_blank', 'noopener');
      reportShare(channel);
      return;
    }

    if (channel === 'copy') {
      // On copie le message, pas seulement l'URL : un lien nu dans un groupe
      // WhatsApp ne vend rien, le message donne le prix et la réassurance.
      const ok = await copyToClipboard(message);
      if (ok) {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
      if (ok) reportShare(channel);
      return;
    }

    try {
      await navigator.share({ title, text: message, url: link });
      reportShare('native');
    } catch (err) {
      if (isShareAbort(err)) return;
      // Partage natif refusé ou indisponible : on se rabat sur le presse-papier
      // plutôt que de laisser l'utilisateur sans rien.
      const ok = await copyToClipboard(message);
      if (ok) {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
        reportShare('copy');
      }
    }
  }

  const countLabel =
    shareCount !== undefined && shareCount > 0
      ? `${shareCount} partage${shareCount > 1 ? 's' : ''}`
      : null;

  if (variant === 'button') {
    return (
      <div className={`relative ${className}`}>
        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3.5 py-2 text-xs font-medium text-bone/80 hover:border-gold/40 hover:text-gold"
          aria-expanded={menuOpen}
          aria-haspopup="menu"
        >
          <Share2 size={14} /> Partager
          {countLabel ? <span className="text-bone/40">{countLabel}</span> : null}
        </button>

        {menuOpen ? (
          <>
            <div
              className="fixed inset-0 z-10"
              onClick={() => setMenuOpen(false)}
              aria-hidden
            />
            <div
              role="menu"
              // Ouverture vers le HAUT : la variante `button` n'est utilisée que
              // dans la barre fixe en bas de l'écran. Un menu qui se déplie vers
              // le bas serait coupé par le bord inférieur sur mobile, là où le
              // partage se fait justement.
              className="absolute bottom-full right-0 z-20 mb-2 w-52 overflow-hidden rounded-ticket border border-white/10 bg-navy-deep shadow-xl"
            >
              {nativeAvailable ? (
                <MenuItem label="Partager via…" onClick={() => void share('native')} />
              ) : null}
              <MenuItem label="WhatsApp" icon="💬" onClick={() => void share('whatsapp')} />
              <MenuItem label="Facebook" icon="📘" onClick={() => void share('facebook')} />
              <MenuItem
                label={copied ? 'Lien copié !' : 'Copier le lien'}
                icon={copied ? '✅' : '📋'}
                onClick={() => void share('copy')}
              />
            </div>
          </>
        ) : null}
      </div>
    );
  }

  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`}>
      {nativeAvailable ? (
        <button
          type="button"
          onClick={() => void share('native')}
          className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-medium text-bone/80 hover:border-gold/40 hover:text-gold"
        >
          <Share2 size={13} /> Partager
        </button>
      ) : null}
      {(['whatsapp', 'facebook'] as const).map((channel) => (
        <button
          key={channel}
          type="button"
          onClick={() => void share(channel)}
          className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium text-white transition ${CHANNEL_STYLE[channel]}`}
        >
          <span aria-hidden>{CHANNEL_ICON[channel]}</span>
          {CHANNEL_LABEL[channel]}
        </button>
      ))}
      <button
        type="button"
        onClick={() => void share('copy')}
        className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-xs font-medium text-bone/80 transition hover:bg-white/20"
      >
        {copied ? <Check size={13} className="text-emerald-300" /> : <Copy size={13} />}
        {copied ? 'Copié !' : 'Copier'}
      </button>
      {countLabel ? <span className="text-[11px] text-bone/40">{countLabel}</span> : null}
    </div>
  );
}

function MenuItem({
  label,
  icon,
  onClick,
}: {
  label: string;
  icon?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm text-bone/80 hover:bg-white/5"
    >
      {icon ? <span aria-hidden>{icon}</span> : <Share2 size={14} />}
      {label}
    </button>
  );
}
