'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Plus, Search, Edit2, Phone, ChevronLeft } from 'lucide-react';
import MainLayout from '@/components/layout/MainLayout';
import Modal from '@/components/ui/Modal';
import ClientForm from '@/components/forms/ClientForm';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import { Client } from '@/lib/types';
import { formatCurrency, getClientTypeLabel } from '@/lib/utils';

export default function ClientsPage() {
  const [clients,   setClients]   = useState<Client[]>([]);
  const [filtered,  setFiltered]  = useState<Client[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [search,    setSearch]    = useState('');
  const [typeFilter,setTypeFilter]= useState<'all' | 'debtor' | 'creditor'>('all');
  const [showAdd,   setShowAdd]   = useState(false);
  const [editTarget,setEditTarget]= useState<Client | null>(null);

  const loadClients = useCallback(async () => {
    setLoading(true);
    const data: Client[] = await fetch('/api/clients').then((r) => r.json());
    setClients(data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { loadClients(); }, [loadClients]);

  // فلترة العملاء
  useEffect(() => {
    let list = clients;
    if (typeFilter !== 'all') list = list.filter((c) => c.type === typeFilter);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          (c.phone ?? '').includes(q)
      );
    }
    setFiltered(list);
  }, [clients, search, typeFilter]);

  return (
    <MainLayout
      permission="clients.view"
      title="العملاء"
      subtitle={`${clients.length} عميل مسجّل`}
      actions={
        <button onClick={() => setShowAdd(true)} className="btn-primary flex items-center gap-1.5">
          <Plus className="w-4 h-4" /> إضافة عميل
        </button>
      }
    >
      {/* شريط البحث والفلتر */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="بحث بالاسم أو الهاتف..."
            className="input-field pr-9"
          />
        </div>
        <div className="flex gap-2">
          {(['all', 'debtor', 'creditor'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTypeFilter(t)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                typeFilter === t
                  ? 'bg-indigo-600 text-white'
                  : 'bg-white text-gray-600 border border-gray-300 hover:bg-gray-50'
              }`}
            >
              {t === 'all' ? 'الكل' : t === 'debtor' ? 'المدينون' : 'الدائنون'}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <LoadingSpinner />
      ) : filtered.length === 0 ? (
        <div className="card flex flex-col items-center justify-center py-20 text-gray-400">
          <p className="text-lg mb-1">لا يوجد عملاء</p>
          <p className="text-sm">قم بإضافة عميل جديد للبدء</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((client) => (
            <div key={client.id} className="card group hover:shadow-md transition-shadow">
              <div className="p-5">
                {/* رأس البطاقة */}
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0 bg-indigo-100">
                      <span className="text-indigo-700 font-bold text-base">
                        {client.name.charAt(0)}
                      </span>
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-gray-900 truncate">{client.name}</p>
                      <span
                        className={`badge text-xs mt-0.5 ${
                          client.type === 'debtor'
                            ? 'bg-green-50 text-green-700 border border-green-200'
                            : 'bg-red-50 text-red-700 border border-red-200'
                        }`}
                      >
                        {getClientTypeLabel(client.type)}
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={() => setEditTarget(client)}
                    className="p-1.5 text-gray-300 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition opacity-0 group-hover:opacity-100"
                    title="تعديل"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                </div>

                {/* الهاتف */}
                {client.phone && (
                  <div className="flex items-center gap-1.5 text-sm text-gray-500 mb-3">
                    <Phone className="w-3.5 h-3.5" />
                    <span dir="ltr">{client.phone}</span>
                  </div>
                )}

                {/* الرصيد الافتتاحي */}
                {client.opening_balance !== 0 && (
                  <div className="text-sm mb-3">
                    <span className="text-gray-500">الرصيد الافتتاحي: </span>
                    <span className="font-semibold text-gray-900">
                      {formatCurrency(client.opening_balance)}
                    </span>
                  </div>
                )}

                {/* ملاحظات */}
                {client.notes && (
                  <p className="text-xs text-gray-400 truncate mb-3">{client.notes}</p>
                )}

                {/* رابط الملف */}
                <Link
                  href={`/clients/${client.id}`}
                  className="flex items-center justify-between pt-3 border-t border-gray-100 text-indigo-600 hover:text-indigo-800 text-sm font-medium transition"
                >
                  <span>عرض الملف الكامل</span>
                  <ChevronLeft className="w-4 h-4" />
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* نافذة الإضافة */}
      <Modal isOpen={showAdd} onClose={() => setShowAdd(false)} title="إضافة عميل جديد">
        <ClientForm
          onSuccess={() => { setShowAdd(false); loadClients(); }}
          onCancel={() => setShowAdd(false)}
        />
      </Modal>

      {/* نافذة التعديل */}
      <Modal isOpen={!!editTarget} onClose={() => setEditTarget(null)} title="تعديل بيانات العميل">
        {editTarget && (
          <ClientForm
            client={editTarget}
            onSuccess={() => { setEditTarget(null); loadClients(); }}
            onCancel={() => setEditTarget(null)}
          />
        )}
      </Modal>
    </MainLayout>
  );
}
