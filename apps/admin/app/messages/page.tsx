'use client';

import { useEffect, useState, useCallback } from 'react';
import { AdminShell } from '@/components/admin-shell';
import { apiFetch } from '@/lib/api-client';

interface Sender {
  _id: string;
  username: string;
  firstName: string;
  lastName: string;
  email: string;
}

interface PopulatedTransaction {
  _id: string;
  amount: number;
  currency: string;
  buyer: string;
  seller: string;
  listing?: { title: string };
}

interface PopulatedConversation {
  _id: string;
  transaction: PopulatedTransaction | string;
}

interface BlockedMessage {
  _id: string;
  sender: Sender | string;
  content: string;
  flaggedForContactInfo: boolean;
  conversation: PopulatedConversation | string;
  createdAt: string;
}

export default function AdminBlockedMessagesPage() {
  const [messages, setMessages] = useState<BlockedMessage[] | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      const data = await apiFetch<{ messages: BlockedMessage[] }>(
        '/api/v1/admin/messages/blocked',
      );
      setMessages(data.messages);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur de chargement');
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function senderLabel(m: BlockedMessage): string {
    if (typeof m.sender === 'string') return m.sender;
    return m.sender.username || m.sender.email || [m.sender.firstName, m.sender.lastName].filter(Boolean).join(' ');
  }

  function txLabel(m: BlockedMessage): string {
    if (typeof m.conversation === 'string') return m.conversation;
    const t = m.conversation.transaction;
    if (typeof t === 'string') return t;
    if (t?.listing?.title) return `${t.listing.title} — ${t.amount.toLocaleString('fr-FR')} ${t.currency}`;
    return `${t?.amount?.toLocaleString('fr-FR') ?? ''} ${t?.currency ?? ''}`.trim() || 'Transaction';
  }

  return (
    <AdminShell title="Messages bloqués">
      <p className="mb-4 text-sm text-bone/50">
        Tentatives de partage de coordonnées (numéro, email, lien externe) bloquées et signalées
        automatiquement par la messagerie.
      </p>

      {error && <p className="mb-4 text-sm text-coral">{error}</p>}

      {!messages ? (
        <p className="text-sm text-bone/50">Chargement…</p>
      ) : messages.length === 0 ? (
        <p className="text-sm text-bone/50">Aucun message bloqué.</p>
      ) : (
        <div className="space-y-3">
          {messages.map((m) => (
            <div key={m._id} className="rounded-ticket border border-coral/20 bg-navy-mid p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="rounded-full bg-coral/15 px-2.5 py-1 text-xs font-medium text-coral">
                  Bloqué
                </span>
                <span className="text-xs text-bone/40">
                  {new Date(m.createdAt).toLocaleString('fr-FR')}
                </span>
              </div>
              <p className="mt-3 whitespace-pre-wrap text-sm text-bone/80">{m.content}</p>
              <div className="mt-3 border-t border-white/5 pt-2 text-xs text-bone/50">
                <p>Envoyé par : <span className="font-mono text-bone/70">{senderLabel(m)}</span></p>
                <p className="mt-1">Transaction : <span className="font-mono text-bone/70">{txLabel(m)}</span></p>
                <p className="mt-1">Message : <span className="font-mono text-bone/40">{m._id}</span></p>
              </div>
            </div>
          ))}
        </div>
      )}
    </AdminShell>
  );
}