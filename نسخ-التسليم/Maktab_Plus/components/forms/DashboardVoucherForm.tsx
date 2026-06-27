'use client';

import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Check, Search } from 'lucide-react';
import { Client } from '@/lib/types';
import VoucherForm from './VoucherForm';

interface DashboardVoucherFormProps {
  onSuccess: () => void;
  onCancel: () => void;
}

export default function DashboardVoucherForm({
  onSuccess,
  onCancel,
}: DashboardVoucherFormProps) {
  const [clients, setClients] = useState<Client[]>([]);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/clients')
      .then((response) => {
        if (!response.ok) throw new Error();
        return response.json();
      })
      .then((data: Client[]) => setClients(data ?? []))
      .catch(() => setError('تعذّر تحميل قائمة العملاء'))
      .finally(() => setLoading(false));
  }, []);

  const filteredClients = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return clients;

    return clients.filter((client) =>
      client.name.toLowerCase().includes(query) ||
      (client.phone ?? '').toLowerCase().includes(query)
    );
  }, [clients, search]);

  if (selectedClient) {
    return (
      <div className="space-y-4">
        <button
          type="button"
          onClick={() => setSelectedClient(null)}
          className="btn-secondary flex items-center gap-2 text-sm"
        >
          <ArrowRight className="w-4 h-4" />
          تغيير العميل
        </button>
        <VoucherForm
          client={selectedClient}
          onSuccess={onSuccess}
          onCancel={onCancel}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          ابحث عن العميل <span className="text-red-500">*</span>
        </label>
        <div className="relative">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="اكتب أي جزء من اسم العميل أو رقم الجوال..."
            className="input-field pr-10"
            autoFocus
            autoComplete="off"
          />
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="max-h-80 overflow-y-auto rounded-xl border border-gray-200 bg-white">
        {loading ? (
          <p className="px-4 py-8 text-center text-sm text-gray-400">جارٍ تحميل العملاء...</p>
        ) : filteredClients.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-gray-400">
            لا يوجد عميل مطابق للاسم أو رقم الجوال
          </p>
        ) : (
          filteredClients.map((client) => (
            <button
              key={client.id}
              type="button"
              onClick={() => setSelectedClient(client)}
              className="w-full flex items-center justify-between gap-3 px-4 py-3 text-right hover:bg-indigo-50 border-b border-gray-100 last:border-b-0 transition-colors"
            >
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-gray-900 truncate">
                  {client.name}
                </span>
                <span className="block text-xs text-gray-500 mt-1" dir="ltr">
                  {client.phone || 'بدون رقم جوال'}
                </span>
              </span>
              <Check className="w-4 h-4 text-indigo-500 flex-shrink-0" />
            </button>
          ))
        )}
      </div>
    </div>
  );
}

