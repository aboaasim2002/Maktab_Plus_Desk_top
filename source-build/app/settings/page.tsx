'use client';

import { FormEvent, useEffect, useState } from 'react';
import { Building2, MapPin, Save } from 'lucide-react';
import MainLayout from '@/components/layout/MainLayout';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import { defaultOfficeSettings, OfficeSettings } from '@/lib/office-settings';

export default function SettingsPage() {
  const [settings, setSettings] = useState<OfficeSettings>(defaultOfficeSettings);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/settings')
      .then((response) => response.json())
      .then((data) => setSettings({ ...defaultOfficeSettings, ...data }))
      .finally(() => setLoading(false));
  }, []);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setMessage('');
    setError('');

    if (!settings.officeName.trim()) {
      setError('اسم المكتب مطلوب');
      return;
    }

    setSaving(true);
    const response = await fetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings),
    });
    setSaving(false);

    if (!response.ok) {
      const data = await response.json().catch(() => ({ error: 'تعذر حفظ البيانات' }));
      setError(data.error);
      return;
    }

    const saved = await response.json();
    setSettings(saved);
    setMessage('تم حفظ بيانات المكتب بنجاح');
    window.dispatchEvent(new Event('office-settings-updated'));
  }

  if (loading) {
    return (
      <MainLayout title="بيانات المكتب" permission="settings.view">
        <LoadingSpinner />
      </MainLayout>
    );
  }

  return (
    <MainLayout
      permission="settings.view"
      title="بيانات المكتب"
      subtitle="تظهر هذه البيانات في لوحة التحكم والتقارير والسندات المطبوعة"
    >
      <div className="max-w-2xl mx-auto">
        <form onSubmit={handleSubmit} className="card p-6 space-y-5">
          <div className="flex items-center gap-3 pb-4 border-b border-gray-100">
            <div className="w-11 h-11 rounded-xl bg-indigo-100 flex items-center justify-center">
              <Building2 className="w-5 h-5 text-indigo-700" />
            </div>
            <div>
              <h2 className="font-semibold text-gray-900">هوية المكتب</h2>
              <p className="text-sm text-gray-500">يمكن تعديلها في أي وقت</p>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              اسم المكتب <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <Building2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                value={settings.officeName}
                onChange={(event) => setSettings((current) => ({ ...current, officeName: event.target.value }))}
                className="input-field pr-10"
                placeholder="مثال: مكتب الخدمات العامة"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">عنوان المكتب</label>
            <div className="relative">
              <MapPin className="absolute right-3 top-3 w-4 h-4 text-gray-400" />
              <textarea
                value={settings.officeAddress}
                onChange={(event) => setSettings((current) => ({ ...current, officeAddress: event.target.value }))}
                className="input-field pr-10 resize-none"
                rows={3}
                placeholder="المدينة، الحي، الشارع أو أي تفاصيل للعنوان"
              />
            </div>
          </div>

          {message && <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">{message}</div>}
          {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

          <button type="submit" disabled={saving} className="btn-primary flex items-center gap-2">
            <Save className="w-4 h-4" />
            {saving ? 'جارٍ الحفظ...' : 'حفظ بيانات المكتب'}
          </button>
        </form>
      </div>
    </MainLayout>
  );
}
