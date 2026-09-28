'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from './api-client';

interface CurrentUser {
  id: string;
  roles: string[];
  /**
   * Lu via /auth/me. Sert à afficher un rappel tant que l'email n'est pas
   * confirmé — l'API reste la seule autorité (c'est `requireEmailVerified`
   * qui bloque), ce n'est qu'un signal d'interface.
   */
  emailVerified: boolean;
  /**
   * Consentement marketing. Optionnel car `/auth/me` ne renvoie ce bloc que
   * pour les comptes ayant déjà la colonne renseignée ; l'absence vaut
   * « pas inscrit », jamais « inscrit » — on ne veut pas afficher une case
   * cochée par défaut à quelqu'un qui ne l'a jamais demandé.
   */
  marketing?: { optedIn: boolean };
}

// Événement global : permet à toutes les instances montées de useCurrentUser
// (header, pages…) de se re-synchroniser après un login/logout côté client,
// car le composant reste monté pendant la navigation Next.js.
const AUTH_CHANGED_EVENT = 'gm:auth-changed';

export function notifyAuthChanged() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(AUTH_CHANGED_EVENT));
  }
}

export function useCurrentUser() {
  const [user, setUser] = useState<CurrentUser | null | undefined>(undefined);

  const refresh = useCallback(() => {
    let cancelled = false;
    apiFetch<CurrentUser | null>('/api/v1/auth/me')
      .then((u) => {
        if (!cancelled) setUser(u);
      })
      .catch(() => {
        if (!cancelled) setUser(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => refresh(), [refresh]);

  useEffect(() => {
    window.addEventListener(AUTH_CHANGED_EVENT, refresh);
    return () => window.removeEventListener(AUTH_CHANGED_EVENT, refresh);
  }, [refresh]);

  return { user, loading: user === undefined };
}
