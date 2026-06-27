'use client';

import { useState, useEffect } from 'react';
import { Client, VoucherType } from '@/lib/types';
import { tafqeet } from '@/lib/tafqeet';

interface VoucherFormProps {
  client: Client;
  onSuccess: () => void;
  onCancel: () => void;
}

interface FormData {
  voucher_type: VoucherType;
  amount: string;
  amount_text: string;
  payment_date: string;
  description: string;
}

export default function VoucherForm({ client, onSuccess, onCancel }: VoucherFormProps) {
  const today = new Date().toISOString().split('T')[0];

  const [form, setForm] = useState<FormData>({
    voucher_type: 'receipt',
    amount:       '',
    amount_text:  '',
    payment_date: today,
    description:  '',
  });
  const [loading, setLoading] = useState(false);
  const [checkingOperations, setCheckingOperations] = useState(true);
  const [hasOperations, setHasOperations] = useState(false);
  const [error,   setError]   = useState('');

  // تحديث التفقيط تلقائيًا عند تغيير المبلغ
  useEffect(() => {
    const amt = parseFloat(form.amount);
    if (!isNaN(amt) && amt > 0) {
      setForm((prev) => ({ ...prev, amount_text: tafqeet(amt) }));
    } else {
      setForm((prev) => ({ ...prev, amount_text: '' }));
    }
  }, [form.amount]);

  useEffect(() => {
    fetch(`/api/contracts?client_id=${encodeURIComponent(client.id)}`)
      .then((response) => response.json())
      .then((operations) => setHasOperations(Array.isArray(operations) && operations.length > 0))
      .finally(() => setCheckingOperations(false));
  }, [client.id]);

  function handleChange(
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!hasOperations) {
      setError('هذا العميل ليست له عمليات مسجلة. أولاً قم بتسجيل عملية مدينة أو دائنة للعميل.');
      return;
    }

    const amt = parseFloat(form.amount);
    if (!amt || amt <= 0) { setError('المبلغ يجب أن يكون أكبر من صفر'); return; }
    if (!form.amount_text.trim()) { setError('المبلغ كتابةً مطلوب'); return; }
    if (!form.payment_date) { setError('تاريخ السند مطلوب'); return; }

    setLoading(true);

    const res = await fetch('/api/vouchers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        voucher_type: form.voucher_type,
        client_id:    client.id,
        amount:       amt,
        amount_text:  form.amount_text.trim(),
        payment_date: form.payment_date,
        description:  form.description.trim() || null,
      }),
    });

    setLoading(false);

    if (!res.ok) {
      const { error } = await res.json().catch(() => ({ error: 'خطأ غير معروف' }));
      setError('حدث خطأ أثناء حفظ السند: ' + error);
      return;
    }

    onSuccess();
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-4">
      {!checkingOperations && !hasOperations && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">
          هذا العميل ليست له عمليات مسجلة. أولاً قم بتسجيل عملية مدينة أو دائنة للعميل، ثم أصدر سند القبض أو الصرف.
        </div>
      )}
      {/* معلومات العميل */}
      <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
        <p className="text-xs text-gray-500 font-medium mb-1">العميل</p>
        <p className="text-sm text-gray-900 font-semibold">{client.name}</p>
        {client.phone && <p className="text-xs text-gray-400 mt-0.5">{client.phone}</p>}
      </div>

      {/* نوع السند */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          نوع السند <span className="text-red-500">*</span>
        </label>
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => setForm((p) => ({ ...p, voucher_type: 'receipt' }))}
            className={`py-3 px-4 rounded-xl border-2 text-sm font-semibold transition-all text-right ${
              form.voucher_type === 'receipt'
                ? 'border-green-500 bg-green-50 text-green-700'
                : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300'
            }`}
          >
            🟢 سند قبض
            <p className="text-xs font-normal mt-0.5 text-gray-500">المكتب يستلم من العميل</p>
          </button>
          <button
            type="button"
            onClick={() => setForm((p) => ({ ...p, voucher_type: 'payment' }))}
            className={`py-3 px-4 rounded-xl border-2 text-sm font-semibold transition-all text-right ${
              form.voucher_type === 'payment'
                ? 'border-red-500 bg-red-50 text-red-700'
                : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300'
            }`}
          >
            🔴 سند صرف
            <p className="text-xs font-normal mt-0.5 text-gray-500">المكتب يصرف للعميل</p>
          </button>
        </div>
      </div>

      {/* التاريخ */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          تاريخ السند <span className="text-red-500">*</span>
        </label>
        <input
          name="payment_date"
          type="date"
          value={form.payment_date}
          onChange={handleChange}
          className="input-field"
          dir="ltr"
        />
      </div>

      {/* المبلغ */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          المبلغ (ر.س) <span className="text-red-500">*</span>
        </label>
        <input
          name="amount"
          type="text"
          inputMode="decimal"
          value={form.amount}
          onChange={(e) => {
            const value = e.target.value.replace(',', '.');
            if (/^\d*(?:\.\d{0,2})?$/.test(value)) {
              setForm((prev) => ({ ...prev, amount: value }));
            }
          }}
          placeholder="0.00"
          className="input-field text-xl font-semibold"
          dir="ltr"
        />
      </div>

      {/* المبلغ كتابةً (تفقيط) */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          المبلغ كتابةً (تفقيط) <span className="text-red-500">*</span>
        </label>
        <textarea
          name="amount_text"
          value={form.amount_text}
          onChange={handleChange}
          rows={2}
          placeholder="يُولَّد تلقائيًا عند إدخال المبلغ"
          className="input-field resize-none text-sm bg-green-50 border-green-200 text-green-800"
        />
      </div>

      {/* البيان */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">البيان</label>
        <input
          name="description"
          value={form.description}
          onChange={handleChange}
          placeholder="وصف السند (اختياري)"
          className="input-field"
        />
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">
          {error}
        </div>
      )}

      <div className="flex gap-3 pt-2">
        <button
          type="submit"
          disabled={loading || checkingOperations || !hasOperations}
          className={`flex-1 ${form.voucher_type === 'receipt' ? 'btn-primary' : 'bg-red-600 hover:bg-red-700 text-white font-semibold py-2.5 px-4 rounded-xl transition-colors'}`}
        >
          {loading ? 'جارٍ الحفظ...' : `إصدار ${form.voucher_type === 'receipt' ? 'سند القبض' : 'سند الصرف'}`}
        </button>
        <button type="button" onClick={onCancel} className="btn-secondary flex-1">
          إلغاء
        </button>
      </div>
    </form>
  );
}
