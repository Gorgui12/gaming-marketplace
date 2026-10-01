'use client';

import { useEffect, useRef } from 'react';

interface HeroVideoProps {
  src: string;
  label: string;
}

/**
 * Le motion design du hero — la boucle remplace le talon de billet statique.
 *
 * L'autoplay est piloté par l'effet et non par l'attribut `autoPlay` : la
 * media query `prefers-reduced-motion` ne peut pas être évaluée au rendu
 * serveur, donc l'attribut déclencherait une lecture que l'utilisateur a
 * explicitement refusée avant même que l'hydratation ne le corrige.
 *
 * iOS Safari refuse l'autoplay sauf si la piste est muette *et* marquée
 * playsinline : d'où `muted` + la pose explicite de la propriété sur la ref,
 * que React ne garantit pas sur les navigateurs mobiles.
 */
export function HeroVideo({ src, label }: HeroVideoProps) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    video.muted = true;
    video.autoplay = true;
    video.play().catch(() => {
      // Autoplay refusé (Low Power Mode iOS, politique d'UC) : on laisse la
      // première frame affichée plutôt que d'afficher un cadre vide.
    });
  }, []);

  return (
    <div className="ticket-notch overflow-hidden rounded-ticket border border-white/10 bg-navy-mid shadow-2xl shadow-black/30">
      <video
        ref={videoRef}
        className="aspect-video w-full bg-navy-soft object-cover"
        src={src}
        aria-label={label}
        muted
        loop
        playsInline
        preload="metadata"
      />
    </div>
  );
}
