'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';

export interface CurrentUser {
  id: string;
  organization_id: string | null;
  organization_name: string | null;
  arabic_name: string;
  username: string;
  role: 'platform_owner' | 'office_owner' | 'user';
  permission_mode: 'all' | 'custom';
  permissions: string[];
  is_impersonating: boolean;
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
      if (!response.ok && pathname !== '/login') {
        router.replace('/login');
      } else if (
        response.ok
        && data.user?.role === 'platform_owner'
        && !data.user.organization_id
        && !['/login', '/organizations', '/profile'].includes(pathname)
      ) {
        router.replace('/organizations');
      }
    } catch {
      setUser(null);
      if (pathname !== '/login') router.replace('/login');
    } finally {
      setLoading(false);
    }
  }, [pathname, router]);

  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => {
    const verifySessionAfterReturn = (event: PageTransitionEvent) => {
      if (event.persisted) void refresh();
    };
    window.addEventListener('pageshow', verifySessionAfterReturn);
    return () => window.removeEventListener('pageshow', verifySessionAfterReturn);
  }, [refresh]);

  const value = useMemo<AuthValue>(() => ({
    user,
    loading,
    can: (permission) => Boolean(
      user && (
        user.role === 'platform_owner'
        || user.role === 'office_owner'
        || user.permission_mode === 'all'
        || user.permissions.includes(permission)
      )
    ),
    refresh,
    logout: async () => {
      if (!window.confirm('هل تريد تسجيل الخروج؟')) {
        return;
      }
      setUser(null);
      try {
        await fetch('/api/auth/logout', {
          method: 'POST',
          cache: 'no-store',
          credentials: 'same-origin',
        });
      } finally {
        window.location.replace('/login');
      }
    },
  }), [user, loading, refresh, router]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider');
  return value;
}
