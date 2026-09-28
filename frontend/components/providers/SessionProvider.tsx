'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { apiFetch, ApiError } from '@/lib/api';
import { clearSession } from '@/lib/auth';
import { isSession, type Session } from '@/lib/session';
import { Button } from '../ui/button';

interface SessionContextValue { session: Session; refresh: () => Promise<void> }
const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children, fallback }: { children: React.ReactNode; fallback: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const returnTo = `${pathname}${searchParams.size ? `?${searchParams.toString()}` : ''}`;
  const [session, setSession] = useState<Session | null>(null);
  const [failed, setFailed] = useState(false);
  const loadSession = useCallback(async (isActive: () => boolean = () => true) => {
    setFailed(false);
    try {
      const value = await apiFetch<unknown>('/auth/me');
      if (!isActive()) return;
      if (!isSession(value)) {
        clearSession();
        router.replace(`/login?next=${encodeURIComponent(returnTo)}`);
        return;
      }
      setSession(value);
    } catch (error) {
      if (!isActive()) return;
      if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
        clearSession();
        router.replace(`/login?next=${encodeURIComponent(returnTo)}`);
      } else {
        setFailed(true);
      }
    }
  }, [returnTo, router]);

  useEffect(() => {
    let active = true;
    void loadSession(() => active);
    return () => { active = false; };
  }, [loadSession]);

  if (failed) return <SessionFailure retry={() => void loadSession()} />;
  if (!session) return <>{fallback}</>;
  return <SessionContext.Provider value={{ session, refresh: loadSession }}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const context = useContext(SessionContext);
  if (!context) throw new Error('useSession must be used inside SessionProvider');
  return context;
}

function SessionFailure({ retry }: { retry: () => void }) {
  return <main className="flex min-h-dvh items-center justify-center p-6 text-center" role="alert"><div><h1 className="text-section-title text-brand">Koneksi sesi terganggu</h1><p className="mt-2 text-body text-muted">Sesi Anda tidak dihapus. Periksa koneksi lalu coba kembali.</p><Button onClick={retry} className="mt-5">Coba lagi</Button></div></main>;
}
