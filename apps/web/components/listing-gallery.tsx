'use client';

import Image from 'next/image';
import { useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export function ListingGallery({ images, title }: { images: string[]; title: string }) {
  const [active, setActive] = useState(0);
  const touchStartX = useRef<number | null>(null);

  if (images.length === 0) {
    return (
      <div className="flex aspect-[16/10] items-center justify-center rounded-ticket border border-white/10 bg-navy-mid font-mono text-xs text-bone/30">
        Captures bientôt disponibles
      </div>
    );
  }

  const current: string = images[active] ?? images[0]!;

  const prev = () => setActive((i) => (i - 1 + images.length) % images.length);
  const next = () => setActive((i) => (i + 1) % images.length);

  // Navigation au doigt : un swipe horizontal (>40px) change d'image.
  function handleTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0]?.clientX ?? null;
  }
  function handleTouchEnd(e: React.TouchEvent) {
    if (touchStartX.current === null || images.length < 2) return;
    const endX = e.changedTouches[0]?.clientX;
    if (endX === undefined) return;
    const delta = endX - touchStartX.current;
    if (Math.abs(delta) > 40) {
      if (delta < 0) next();
      else prev();
    }
    touchStartX.current = null;
  }

  return (
    <div>
      <div
        className="relative aspect-[16/10] touch-pan-y overflow-hidden rounded-ticket border border-white/10 bg-navy-mid"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        <Image
          key={current}
          src={current}
          alt={`${title} — capture ${active + 1}/${images.length}`}
          fill
          priority
          sizes="(min-width: 1024px) 640px, 100vw"
          className="object-cover"
        />
        {images.length > 1 ? (
          <>
            <button
              type="button"
              onClick={prev}
              aria-label="Image précédente"
              className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-2.5 text-bone backdrop-blur transition hover:bg-black/70"
            >
              <ChevronLeft size={18} />
            </button>
            <button
              type="button"
              onClick={next}
              aria-label="Image suivante"
              className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-2.5 text-bone backdrop-blur transition hover:bg-black/70"
            >
              <ChevronRight size={18} />
            </button>
            <span className="absolute bottom-3 right-3 rounded-full bg-black/60 px-3 py-1 font-mono text-xs text-bone backdrop-blur">
              {active + 1}/{images.length}
            </span>
          </>
        ) : null}
      </div>

      {images.length > 1 ? (
        <div className="mt-3 flex snap-x gap-3 overflow-x-auto pb-1">
          {images.map((src, i) => (
            <button
              key={`${src}-${i}`}
              type="button"
              onClick={() => setActive(i)}
              aria-label={`Voir la capture ${i + 1}`}
              className={`relative h-16 w-24 flex-none snap-start overflow-hidden rounded-lg border transition ${
                i === active
                  ? 'border-gold opacity-100'
                  : 'border-white/10 opacity-50 hover:opacity-90'
              }`}
            >
              <Image src={src} alt="" fill sizes="96px" className="object-cover" />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
