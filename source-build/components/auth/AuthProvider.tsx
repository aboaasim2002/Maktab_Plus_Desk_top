'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';

export interface CurrentUser {
  id: string;
  arabic_name: string;
  username: string;
  role: 'admin' | 'user';
  permission_mode: 'all' | 'custom';
  permissions: string[];
}

interface AuthValue {
  user: CurrentUser | null;
  loading: boolean;
  can: (permission: string) => boolean;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

export default function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(true);
  const pathname = usePathname();
  const router = useRouter();

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/auth/session', { cache: 'no-store' });
      const data = await response.json();
      setUser(response.ok ? data.user : null);
      if (!response.ok && pathname !== '/login') router.replace('/login');
    } catch {
      setUser(null);
      if (pathname !== '/login') router.replace('/login');
    } finally {
      setLoading(false);
    }
  }, [pathname, router]);

  useEffect(() => { refresh(); }, [refresh]);

  const value = useMemo<AuthValue>(() => ({
    user,
    loading,
    can: (permission) => Boolean(
      user && (user.role === 'admin' || user.permission_mode === 'all' || user.permissions.includes(permission))
    ),
    refresh,
    logout: async () => {
      const desktopApi = (window as Window & {
        electronAPI?: { confirmLogout?: () => Promise<{ proceed: boolean }> };
      }).electronAPI;
      if (desktopApi?.confirmLogout) {
        const confirmation = await desktopApi.confirmLogout();
        if (!confirmation?.proceed) return;
      } else if (!window.confirm('هل تريد تسجيل الخروج؟')) {
        return;
      }
      await fetch('/api/auth/logout', { method: 'POST' });
      setUser(null);
      router.replace('/login');
    },
  }), [user, loading, refresh, router]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider');
  return value;
}
