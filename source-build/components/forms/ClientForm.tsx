'use client';

import { useState } from 'react';
import { Client } from '@/lib/types';

interface ClientFormProps {
  client?: Client;           // إذا موجود → وضع التعديل
  onSuccess: (savedClient: Client) => void;
  onCancel: () => void;
}

interface FormData {
  name: string;
  phone: string;
  notes: string;
}

export default function ClientForm({ client, onSuccess, onCancel }: ClientFormProps) {
  const isEdit = !!client;

  const [form, setForm] = useState<FormData>({
    name:            client?.name            ?? '',
    phone:           client?.phone           ?? '',
    notes:           client?.notes           ?? '',
  });
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');

  function handleChange(
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (!form.name.trim()) {
      setError('اسم العميل مطلوب');
      return;
    }

    setLoading(true);

    const payload = {
      name:            form.name.trim(),
      phone:           form.phone.trim() || null,
      type:            client?.type ?? 'debtor',
      opening_balance: client?.opening_balance ?? 0,
      notes:           form.notes.trim() || null,
    };

    const res = isEdit
      ? await fetch(`/api/clients/${client!.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
      : await fetch('/api/clients', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

    setLoading(false);

    if (!res.ok) {
      const { error } = await res.json().catch(() => ({ error: 'خطأ غير معروف' }));
      setError('حدث خطأ أثناء الحفظ: ' + error);
      return;
    }

    const savedClient = await res.json() as Client;
    onSuccess(savedClient);
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-4">
      {/* الاسم */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          اسم العميل <span className="text-red-500">*</span>
        </label>
        <input
          name="name"
          value={form.name}
          onChange={handleChange}
          placeholder="ادخل اسم العميل أو الجهة"
          className="input-field"
        />
      </div>

      {/* رقم الهاتف */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          رقم الهاتف
        </label>
        <input
          name="phone"
          type="tel"
          value={form.phone}
          onChange={handleChange}
          placeholder="05xxxxxxxx"
          className="input-field"
          dir="ltr"
        />
      </div>

      {/* ملاحظات */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          ملاحظات
        </label>
        <textarea
          name="notes"
          value={form.notes}
          onChange={handleChange}
          rows={3}
          placeholder="ملاحظات إضافية (اختياري)"
          className="input-field resize-none"
        />
      </div>

      {/* رسالة الخطأ */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">
          {error}
        </div>
      )}

      {/* الأزرار */}
      <div className="flex gap-3 pt-2">
        <button type="submit" disabled={loading} className="btn-primary flex-1">
          {loading ? 'جارٍ الحفظ...' : isEdit ? 'حفظ التعديلات' : 'إضافة العميل'}
        </button>
        <button type="button" onClick={onCancel} className="btn-secondary flex-1">
          إلغاء
        </button>
      </div>
    </form>
  );
}
