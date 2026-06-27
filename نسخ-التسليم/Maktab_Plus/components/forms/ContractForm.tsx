'use client';

import { useState, useEffect, useRef } from 'react';
import { Check, ChevronDown, Search } from 'lucide-react';
import { Client, Contract, ContractStatus, OperationType } from '@/lib/types';
import { toInputDate } from '@/lib/utils';

interface ContractFormProps {
  contract?: Contract;
  preselectedClientId?: string;
  onSuccess: () => void;
  onCancel: () => void;
}

interface FormData {
  client_id: string;
  description: string;
  total_amount: string;
  operation_type: OperationType;
  contract_date: string;
  status: ContractStatus;
  notes: string;
}

export default function ContractForm({
  contract,
  preselectedClientId,
  onSuccess,
  onCancel,
}: ContractFormProps) {
  const isEdit = !!contract;

  const today = new Date().toISOString().split('T')[0];

  const [form, setForm] = useState<FormData>({
    client_id:      contract?.client_id      ?? preselectedClientId ?? '',
    description:    contract?.description    ?? '',
    total_amount:   contract?.total_amount?.toString() ?? '',
    operation_type: contract?.operation_type ?? 'debit_on_client',
    contract_date:  contract ? toInputDate(contract.contract_date) : today,
    status:         contract?.status         ?? 'active',
    notes:          contract?.notes          ?? '',
  });

  const [clients,  setClients]  = useState<Client[]>([]);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState('');
  const [fetchErr, setFetchErr] = useState('');
  const [clientSearch, setClientSearch] = useState('');
  const [clientListOpen, setClientListOpen] = useState(false);
  const clientPickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch('/api/clients')
      .then((r) => r.json())
      .then((data: Client[]) => {
        const loadedClients = data ?? [];
        setClients(loadedClients);
        const initialClientId = contract?.client_id ?? preselectedClientId ?? '';
        const selected = loadedClients.find((client) => client.id === initialClientId);
        if (selected) setClientSearch(selected.name);
      })
      .catch(() => setFetchErr('تعذّر تحميل قائمة العملاء'));
  }, [contract?.client_id, preselectedClientId]);

  useEffect(() => {
    function handleOutsideClick(event: MouseEvent) {
      if (!clientPickerRef.current?.contains(event.target as Node)) {
        setClientListOpen(false);
      }
    }

    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  const selectedClient = clients.find((client) => client.id === form.client_id);
  const selectedNameIsDisplayed = Boolean(
    selectedClient && clientSearch.trim() === selectedClient.name.trim()
  );
  const normalizedSearch = selectedNameIsDisplayed ? '' : clientSearch.trim().toLowerCase();
  const filteredClients = clients.filter((client) => {
    if (!normalizedSearch) return true;
    return (
      client.name.toLowerCase().includes(normalizedSearch) ||
      (client.phone ?? '').toLowerCase().includes(normalizedSearch)
    );
  });

  function selectClient(client: Client) {
    setForm((prev) => ({ ...prev, client_id: client.id }));
    setClientSearch(client.name);
    setClientListOpen(false);
  }

  function handleChange(
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (!form.client_id) { setError('يرجى اختيار العميل'); return; }
    if (!form.description.trim()) { setError('وصف العملية مطلوب'); return; }
    const total = parseFloat(form.total_amount);
    if (!total || total <= 0) { setError('المبلغ يجب أن يكون أكبر من صفر'); return; }
    if (!form.contract_date) { setError('تاريخ العملية مطلوب'); return; }

    setLoading(true);

    const payload = {
      client_id:      form.client_id,
      description:    form.description.trim(),
      total_amount:   total,
      operation_type: form.operation_type,
      contract_date:  form.contract_date,
      status:         form.status,
      notes:          form.notes.trim() || null,
    };

    const res = isEdit
      ? await fetch(`/api/contracts/${contract!.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
      : await fetch('/api/contracts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

    setLoading(false);
    if (!res.ok) { const { error } = await res.json().catch(() => ({ error: 'خطأ' })); setError('حدث خطأ أثناء الحفظ: ' + error); return; }

    onSuccess();
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-4">
      {fetchErr && (
        <div className="bg-amber-50 border border-amber-200 text-amber-700 text-sm rounded-lg px-4 py-3">
          {fetchErr}
        </div>
      )}

      {/* العميل */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          العميل <span className="text-red-500">*</span>
        </label>
        <div ref={clientPickerRef} className="relative">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 z-10" />
          <input
            type="text"
            value={clientSearch}
            onFocus={() => {
              if (!(preselectedClientId && !isEdit)) setClientListOpen(true);
            }}
            onChange={(event) => {
              setClientSearch(event.target.value);
              setForm((prev) => ({ ...prev, client_id: '' }));
              setClientListOpen(true);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Escape') setClientListOpen(false);
              if (event.key === 'Enter' && clientListOpen && filteredClients.length === 1) {
                event.preventDefault();
                selectClient(filteredClients[0]);
              }
            }}
            placeholder="ابحث باسم العميل أو رقم الجوال..."
            className="input-field pr-10 pl-10"
            autoComplete="off"
            disabled={!!preselectedClientId && !isEdit}
          />
          <ChevronDown className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />

          {clientListOpen && (
            <div className="absolute z-50 mt-1 w-full max-h-64 overflow-y-auto rounded-xl border border-gray-200 bg-white shadow-xl">
              {filteredClients.length === 0 ? (
                <p className="px-4 py-5 text-center text-sm text-gray-400">
                  لا يوجد عميل مطابق للاسم أو رقم الجوال
                </p>
              ) : (
                filteredClients.map((client) => (
                  <button
                    key={client.id}
                    type="button"
                    onClick={() => selectClient(client)}
                    className="w-full flex items-center justify-between gap-3 px-4 py-3 text-right hover:bg-indigo-50 border-b border-gray-50 last:border-b-0"
                  >
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-gray-900 truncate">{client.name}</span>
                      <span className="block text-xs text-gray-500 mt-0.5" dir="ltr">
                        {client.phone || 'بدون رقم جوال'}
                      </span>
                    </span>
                    {form.client_id === client.id && <Check className="w-4 h-4 text-indigo-600 flex-shrink-0" />}
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      </div>

      {/* نوع العملية */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          نوع العملية <span className="text-red-500">*</span>
        </label>
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => setForm((p) => ({ ...p, operation_type: 'debit_on_client' }))}
            className={`py-3 px-4 rounded-xl border-2 text-sm font-semibold transition-all text-right ${
              form.operation_type === 'debit_on_client'
                ? 'border-orange-500 bg-orange-50 text-orange-700'
                : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300'
            }`}
          >
            🔴 مدين على العميل
            <p className="text-xs font-normal mt-0.5 text-gray-500">العميل يدفع للمكتب</p>
          </button>
          <button
            type="button"
            onClick={() => setForm((p) => ({ ...p, operation_type: 'credit_on_client' }))}
            className={`py-3 px-4 rounded-xl border-2 text-sm font-semibold transition-all text-right ${
              form.operation_type === 'credit_on_client'
                ? 'border-purple-500 bg-purple-50 text-purple-700'
                : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300'
            }`}
          >
            🟣 دائن على المكتب
            <p className="text-xs font-normal mt-0.5 text-gray-500">المكتب يدفع للعميل</p>
          </button>
        </div>
      </div>

      {/* وصف العملية */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          وصف العملية / الخدمة <span className="text-red-500">*</span>
        </label>
        <textarea
          name="description"
          value={form.description}
          onChange={handleChange}
          rows={3}
          placeholder="مثال: دهان بويات مبنى - صيانة مكيفات"
          className="input-field resize-none"
        />
      </div>

      {/* المبلغ + التاريخ */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            مبلغ العملية <span className="text-red-500">*</span>
          </label>
          <input
            name="total_amount"
            type="text"
            inputMode="decimal"
            value={form.total_amount}
            onChange={(e) => {
              const value = e.target.value.replace(',', '.');
              if (/^\d*(?:\.\d{0,2})?$/.test(value)) {
                setForm((prev) => ({ ...prev, total_amount: value }));
              }
            }}
            placeholder="0.00"
            className="input-field"
            dir="ltr"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            تاريخ العملية <span className="text-red-500">*</span>
          </label>
          <input
            name="contract_date"
            type="date"
            value={form.contract_date}
            onChange={handleChange}
            className="input-field"
            dir="ltr"
          />
        </div>
      </div>

      {/* ملاحظات */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">ملاحظات</label>
        <textarea
          name="notes"
          value={form.notes}
          onChange={handleChange}
          rows={2}
          placeholder="ملاحظات إضافية (اختياري)"
          className="input-field resize-none"
        />
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">
          {error}
        </div>
      )}

      <div className="flex gap-3 pt-2">
        <button type="submit" disabled={loading} className="btn-primary flex-1">
          {loading ? 'جارٍ الحفظ...' : isEdit ? 'حفظ التعديلات' : 'حفظ العملية'}
        </button>
        <button type="button" onClick={onCancel} className="btn-secondary flex-1">
          إلغاء
        </button>
      </div>
    </form>
  );
}
