import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import type { AppNotification, NotificationsResponse } from '../../shared/types';
import { api } from './api';
import { useOverview } from './overview';

interface NoticesState {
  notices: AppNotification[];
  refresh: () => Promise<void>;
  dismiss: (id: string) => Promise<void>;
}

type BadgeNavigator = Navigator & {
  setAppBadge?: (count?: number) => Promise<void>;
  clearAppBadge?: () => Promise<void>;
};

const NoticesContext = createContext<NoticesState | null>(null);

/** Unread notices of the signed-in apartment; re-checked whenever the overview refreshes. */
export function NoticesProvider({ children }: { children: ReactNode }) {
  const { fetchedAt } = useOverview();
  const [notices, setNotices] = useState<AppNotification[]>([]);

  const refresh = useCallback(async () => {
    try {
      setNotices((await api<NotificationsResponse>('GET', '/api/notifications')).notifications);
    } catch {
      /* keep the last known notices */
    }
  }, []);

  const dismiss = useCallback(async (id: string) => {
    setNotices((list) => list.filter((n) => n.id !== id));
    await api('POST', `/api/notifications/${id}/read`, {}).catch(() => {});
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh, fetchedAt]);

  useEffect(() => {
    // App icon badge; only supported for installed apps on some platforms.
    const nav = navigator as BadgeNavigator;
    (notices.length ? nav.setAppBadge?.(notices.length) : nav.clearAppBadge?.())?.catch(() => {});
  }, [notices.length]);

  return <NoticesContext.Provider value={{ notices, refresh, dismiss }}>{children}</NoticesContext.Provider>;
}

export function useNotices(): NoticesState {
  const ctx = useContext(NoticesContext);
  if (!ctx) throw new Error('useNotices must be used inside NoticesProvider');
  return ctx;
}
