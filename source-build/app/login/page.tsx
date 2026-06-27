'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { LockKeyhole, User } from 'lucide-react';
import { useAuth } from '@/components/auth/AuthProvider';

export default function LoginPage() {
  const router = useRouter();
  const { refresh } = useAuth();
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError('');
    setLoading(true);
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    const data = await response.json();
    setLoading(false);
    if (!response.ok) return setError(data.error || 'تعذر تسجيل الدخول');
    await refresh();
    const sessionResponse = await fetch('/api/auth/session', { cache: 'no-store' });
    const sessionData = await sessionResponse.json();
    const user = sessionData.user;
    const can = (permission: string) =>
      user?.role === 'admin' || user?.permission_mode === 'all' || user?.permissions?.includes(permission);
    const landingPage =
      can('dashboard.view') ? '/dashboard' :
      can('invoices.view') ? '/invoices' :
      can('clients.view') ? '/clients' :
      can('operations.view') ? '/contracts' :
      can('reports.view') ? '/reports' :
      can('settings.view') ? '/settings' :
      '/profile';
    router.replace(landingPage);
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-indigo-950 via-indigo-800 to-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden">
        <div className="bg-gradient-to-b from-white to-indigo-50 px-8 pt-5 pb-6 text-center border-b border-indigo-100">
          <div className="relative w-44 h-44 sm:w-48 sm:h-48 mx-auto">
            <Image
              src="/maktab-plus-logo.png"
              alt="مكتب بلس"
              fill
              priority
              sizes="192px"
              className="object-contain"
            />
          </div>
          <p className="relative z-10 mt-4 text-sm font-medium text-gray-600">
            أدخل بيانات المستخدم للمتابعة
          </p>
        </div>
        <form onSubmit={submit} className="p-8 space-y-5">
          {error && <div className="rounded-xl bg-red-50 border border-red-200 text-red-700 px-4 py-3 text-sm">{error}</div>}
          <label className="block">
            <span className="block text-sm font-semibold text-gray-700 mb-2">اسم المستخدم</span>
            <span className="relative block">
              <User className="absolute right-3 top-3 w-5 h-5 text-gray-400" />
              <input dir="ltr" className="input-field pr-10 text-left" value={username} onChange={(e) => setUsername(e.target.value)} autoFocus required />
            </span>
          </label>
          <label className="block">
            <span className="block text-sm font-semibold text-gray-700 mb-2">كلمة المرور</span>
            <span className="relative block">
              <LockKeyhole className="absolute right-3 top-3 w-5 h-5 text-gray-400" />
              <input dir="ltr" type="password" className="input-field pr-10 text-left" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </span>
          </label>
          <button disabled={loading} className="btn-primary w-full py-3 text-base">
            {loading ? 'جارٍ تسجيل الدخول...' : 'تسجيل الدخول'}
          </button>
        </form>
      </div>
    </main>
  );
}
