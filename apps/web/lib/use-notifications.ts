'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from './api-client';

interface AppNotification {
  _id: string;
  type: string;
  title: string;
  message: string;
  read: boolean;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

const POLL_INTERVAL_MS = 30_000;

export function useNotifications(enabled: boolean) {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const refresh = useCallback(() => {
    if (!enabled) return;
    apiFetch<{ notifications: AppNotification[]; unreadCount: number }>('/api/v1/notifications')
      .then((d) => {
        setNotifications(d.notifications);
        setUnreadCount(d.unreadCount);
      })
      .catch(() => {});
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    refresh();
    const interval = setInterval(refresh, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [enabled, refresh]);

  async function markRead(id: string) {
    setNotifications((list) => list.map((n) => (n._id === id ? { ...n, read: true } : n)));
    setUnreadCount((c) => Math.max(0, c - 1));
    await apiFetch(`/api/v1/notifications/${id}/read`, { method: 'POST' }).catch(() => {});
  }

  async function markAllRead() {
    setNotifications((list) => list.map((n) => ({ ...n, read: true })));
    setUnreadCount(0);
    await apiFetch('/api/v1/notifications/read-all', { method: 'POST' }).catch(() => {});
  }

  return { notifications, unreadCount, refresh, markRead, markAllRead };
}
