'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from './api-client';

interface CurrentUser {
  id: string;
  roles: string[];
}

export function useCurrentUser() {
  const [user, setUser] = useState<CurrentUser | null | undefined>(undefined);

  useEffect(() => {
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

  return { user, loading: user === undefined };
}
