'use client';

import { useEffect, useRef, useState } from 'react';
import { MessageCircle, Send } from 'lucide-react';
import { apiFetch } from '@/lib/api-client';

interface ChatMessage {
  _id: string;
  sender: string;
  content: string;
  flaggedForContactInfo: boolean;
  createdAt: string;
}

const POLL_INTERVAL_MS = 8_000;

export function TransactionChat({
  transactionId,
  currentUserId,
}: {
  transactionId: string;
  currentUserId: string;
}) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[] | null>(null);
  const [content, setContent] = useState('');
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  function load() {
    apiFetch<{ messages: ChatMessage[] }>(`/api/v1/conversations/${transactionId}/messages`)
      .then((d) => setMessages(d.messages))
      .catch(() => {});
  }

  useEffect(() => {
    if (!open) return;
    load();
    const interval = setInterval(load, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  async function handleSend() {
    if (!content.trim()) return;
    setSending(true);
    try {
      await apiFetch(`/api/v1/conversations/${transactionId}/messages`, {
        method: 'POST',
        json: { content: content.trim() },
      });
      setContent('');
      load();
    } catch {
      // silencieux : l'utilisateur peut réessayer, pas d'action bloquante
    } finally {
      setSending(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="mt-3 flex items-center gap-1.5 rounded-full border border-white/15 px-4 py-2 text-xs text-bone/70 hover:border-white/30"
      >
        <MessageCircle size={14} />
        Discuter avec l&apos;autre partie
      </button>
    );
  }

  return (
    <div className="mt-3 rounded-lg border border-white/10 bg-navy-deep">
      <div className="flex items-center justify-between border-b border-white/10 px-3 py-2">
        <p className="text-xs font-medium text-bone/70">Conversation</p>
        <button onClick={() => setOpen(false)} className="text-xs text-bone/40 hover:text-bone/70">
          Fermer
        </button>
      </div>

      <div ref={scrollRef} className="max-h-56 space-y-2 overflow-y-auto p-3">
        {!messages ? (
          <p className="text-center text-xs text-bone/40">Chargement…</p>
        ) : messages.length === 0 ? (
          <p className="text-center text-xs text-bone/40">
            Aucun message. Écrivez pour démarrer la conversation.
          </p>
        ) : (
          messages.map((m) => {
            const isMine = m.sender === currentUserId;
            return (
              <div key={m._id} className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[80%] rounded-lg px-3 py-2 text-xs ${
                    isMine ? 'bg-gold/20 text-bone' : 'bg-navy-mid text-bone/80'
                  }`}
                >
                  <p>{m.content}</p>
                  {m.flaggedForContactInfo && (
                    <p className="mt-1 text-[10px] text-coral/70">
                      ⚠ Évitez de partager des coordonnées en dehors de la plateforme
                    </p>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="flex items-center gap-2 border-t border-white/10 p-2">
        <input
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSend()}
          maxLength={2000}
          placeholder="Votre message…"
          className="flex-1 rounded-lg border border-white/10 bg-navy-mid px-3 py-1.5 text-xs text-bone outline-none focus:border-gold"
        />
        <button
          onClick={handleSend}
          disabled={sending || !content.trim()}
          className="rounded-full bg-gold p-2 text-navy-deep disabled:opacity-50"
          aria-label="Envoyer"
        >
          <Send size={14} />
        </button>
      </div>
    </div>
  );
}
