'use client';

import { useEffect, useState } from 'react';
import { X, MessageCircle } from 'lucide-react';

const WHATSAPP_CHANNEL_URL =
  'https://whatsapp.com/channel/0029VbE29XnBPzje98CXE50X';
const STORAGE_KEY = 'gm-whatsapp-popup-dismissed';
const DELAY_MS = 8000;

export function WhatsAppPopup() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (window.sessionStorage.getItem(STORAGE_KEY) === '1') return;

    const timer = setTimeout(() => {
      setVisible(true);
    }, DELAY_MS);

    return () => clearTimeout(timer);
  }, []);

  const dismiss = () => {
    setVisible(false);
    window.sessionStorage.setItem(STORAGE_KEY, '1');
  };

  if (!visible) return null;

  return (
    <div
      role="dialog"
      aria-label="Rejoignez notre canal WhatsApp"
      className="fixed bottom-4 left-4 z-[100] w-[calc(100%-2rem)] max-w-sm rounded-ticket border border-white/10 bg-navy-deep p-5 shadow-2xl shadow-black/40 sm:bottom-6 sm:left-6"
    >
      <button
        onClick={dismiss}
        aria-label="Fermer"
        className="absolute right-3 top-3 rounded-full p-1 text-bone/50 hover:bg-white/10 hover:text-bone"
      >
        <X className="h-4 w-4" />
      </button>

      <div className="flex items-start gap-4">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#25D366]/20 text-[#25D366]">
          <MessageCircle className="h-6 w-6" />
        </div>
        <div>
          <p className="font-display text-base text-bone">
            Rejoignez notre canal WhatsApp
          </p>
          <p className="mt-1 text-sm text-bone/60">
            Restez informé des nouvelles annonces, bons plans et astuces gaming.
          </p>
        </div>
      </div>

      <a
        href={WHATSAPP_CHANNEL_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-full bg-[#25D366] px-5 py-3 text-sm font-semibold text-navy-deep hover:opacity-90"
      >
        <MessageCircle className="h-4 w-4" />
        Rejoindre le canal
      </a>
    </div>
  );
}
