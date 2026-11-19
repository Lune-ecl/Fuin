import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, ApiError, getToken, onUnauthorized, setToken, type Bootstrap, type Member, type NavCategory } from './api';

type Status = 'loading' | 'anon' | 'ready' | 'error';

interface SessionValue {
  status: Status;
  error: string | null;
  member: Member | null;
  categories: NavCategory[];
  requestsPending: number;
  login: (prenom: string, nom: string, password: string) => Promise<string | null>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const SessionContext = createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>(getToken() ? 'loading' : 'anon');
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<Bootstrap | null>(null);

  const clear = useCallback(() => {
    setToken(null);
    setData(null);
    setStatus('anon');
  }, []);

  const refresh = useCallback(async () => {
    if (!getToken()) {
      clear();
      return;
    }
    try {
      const b = await api.bootstrap();
      setData(b);
      setError(null);
      setStatus('ready');
    } catch (e) {
      if (e instanceof ApiError && e.code === 'FU401') {
        clear();
      } else {
        setError(e instanceof Error ? e.message : String(e));
        setStatus('error');
      }
    }
  }, [clear]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => onUnauthorized(clear), [clear]);

  const login = useCallback(
    async (prenom: string, nom: string, password: string) => {
      try {
        const r = await api.login(prenom, nom, password);
        if (!r.ok || !r.token) return r.error || 'Connexion refusée.';
        setToken(r.token);
        setStatus('loading');
        await refresh();
        return null;
      } catch (e) {
        return e instanceof Error ? e.message : String(e);
      }
    },
    [refresh],
  );

  const logout = useCallback(async () => {
    try {
      await api.logout();
    } catch {
      /* la session locale est effacée quoi qu'il arrive */
    }
    clear();
  }, [clear]);

  const value = useMemo<SessionValue>(
    () => ({
      status,
      error,
      member: data?.member ?? null,
      categories: data?.categories ?? [],
      requestsPending: data?.requests_pending ?? 0,
      login,
      logout,
      refresh,
    }),
    [status, error, data, login, logout, refresh],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const v = useContext(SessionContext);
  if (!v) throw new Error('useSession hors SessionProvider');
  return v;
}
