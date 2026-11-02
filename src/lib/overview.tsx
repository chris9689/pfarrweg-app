import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { OverviewResponse } from '../../shared/types';
import { api, ApiError } from './api';

const CACHE_KEY = 'parkshare.overview.v1';
const REFRESH_MS = 60_000;

interface OverviewState {
  data: OverviewResponse | null;
  /** Time of the last successful fetch. */
  fetchedAt: number | null;
  failed: boolean;
  /** Technical reason of the last failed refresh, e.g. "server_misconfigured (500)". */
  errorCode: string | null;
  refresh: () => Promise<void>;
}

const OverviewContext = createContext<OverviewState | null>(null);

function readCache(): { data: OverviewResponse; fetchedAt: number } | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/** Public overview data, cached locally so the last known status is visible offline. */
export function OverviewProvider({ children }: { children: ReactNode }) {
  const cached = useRef(readCache());
  const [data, setData] = useState<OverviewResponse | null>(cached.current?.data ?? null);
  const [fetchedAt, setFetchedAt] = useState<number | null>(cached.current?.fetchedAt ?? null);
  const [failed, setFailed] = useState(false);
  const [errorCode, setErrorCode] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const next = await api<OverviewResponse>('GET', '/api/overview');
      const at = Date.now();
      setData(next);
      setFetchedAt(at);
      setFailed(false);
      setErrorCode(null);
      try {
        localStorage.setItem(CACHE_KEY, JSON.stringify({ data: next, fetchedAt: at }));
      } catch {
        /* ignore quota / private mode */
      }
    } catch (err) {
      setFailed(true);
      setErrorCode(err instanceof ApiError ? `${err.code} (${err.status})` : 'unknown');
    }
  }, []);

  useEffect(() => {
    void refresh();
    const id = setInterval(() => document.visibilityState === 'visible' && void refresh(), REFRESH_MS);
    const onVisible = () => document.visibilityState === 'visible' && void refresh();
    const onOnline = () => void refresh();
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onOnline);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onOnline);
    };
  }, [refresh]);

  return (
    <OverviewContext.Provider value={{ data, fetchedAt, failed, errorCode, refresh }}>{children}</OverviewContext.Provider>
  );
}

export function useOverview(): OverviewState {
  const ctx = useContext(OverviewContext);
  if (!ctx) throw new Error('useOverview must be used inside OverviewProvider');
  return ctx;
}

export const DEFAULT_TIMEZONE = 'Europe/Berlin';
