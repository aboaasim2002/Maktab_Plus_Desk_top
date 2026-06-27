'use client';

import { FormEvent, useState } from 'react';
import { KeyRound, UserRound } from 'lucide-react';
import MainLayout from '@/components/layout/MainLayout';
import { useAuth } from '@/components/auth/AuthProvider';

export default function ProfilePage() {
  const { user } = useAuth();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError('');
    setMessage('');
    setSaving(true);
    const response = await fetch('/api/auth/change-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        current_password: currentPassword,
        new_password: newPassword,
        confirm_password: confirmPassword,
      }),
    });
    const data = await response.json();
    setSaving(false);
    if (!response.ok) return setError(data.error || 'تعذر تغيير كلمة المرور');
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setMessage('تم تغيير كلمة المرور بنجاح');
  }

  return (
    <MainLayout title="حسابي" subtitle="عرض بيانات المستخدم وتغيير كلمة المرور">
      <div className="max-w-2xl mx-auto space-y-5">
        <div className="card p-6 flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-indigo-100 text-indigo-700 flex items-center justify-center">
            <UserRound className="w-7 h-7" />
          </div>
          <div>
            <h2 className="text-lg font-bold">{user?.arabic_name}</h2>
            <p className="text-sm text-gray-500" dir="ltr">@{user?.username}</p>
            <p className="text-xs text-gray-400 mt-1">اسم المستخدم يغيّره مدير النظام فقط.</p>
          </div>
        </div>

        <form onSubmit={submit} className="card p-6 space-y-5">
          <div className="flex items-center gap-3 border-b pb-4">
            <KeyRound className="w-6 h-6 text-indigo-600" />
            <div>
              <h2 className="font-bold">تغيير كلمة المرور</h2>
              <p className="text-xs text-gray-500">تُحفظ بتجزئة مشفرة ولا يمكن قراءتها من قاعدة البيانات.</p>
            </div>
          </div>
          {error && <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 p-3 text-sm">{error}</div>}
          {message && <div className="rounded-lg bg-green-50 border border-green-200 text-green-700 p-3 text-sm">{message}</div>}
          <label className="block">
            <span className="block text-sm font-semibold mb-2">كلمة المرور الحالية</span>
            <input dir="ltr" type="password" className="input-field text-left" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required />
          </label>
          <label className="block">
            <span className="block text-sm font-semibold mb-2">كلمة المرور الجديدة</span>
            <input dir="ltr" type="password" minLength={6} className="input-field text-left" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required />
          </label>
          <label className="block">
            <span className="block text-sm font-semibold mb-2">تأكيد كلمة المرور الجديدة</span>
            <input dir="ltr" type="password" minLength={6} className="input-field text-left" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required />
          </label>
          <button disabled={saving} className="btn-primary w-full py-3">
            {saving ? 'جارٍ التغيير...' : 'تغيير كلمة المرور'}
          </button>
        </form>
      </div>
    </MainLayout>
  );
}
