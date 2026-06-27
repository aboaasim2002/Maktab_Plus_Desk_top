'use client';

import { useState, useEffect, useCallback } from 'react';
import { Search } from 'lucide-react';
import MainLayout from '@/components/layout/MainLayout';
import StatementPrint from '@/components/print/StatementPrint';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import { Client, Contract, Voucher, StatementEntry, StatementFilter } from '@/lib/types';
import { formatCurrency } from '@/lib/utils';
import { tafqeet } from '@/lib/tafqeet';

export default function ReportsPage() {
  const [reportScope,     setReportScope]    = useState<'client' | 'office'>('client');
  const [clients,        setClients]       = useState<Client[]>([]);
  const [selectedClient, setSelectedClient]= useState<Client | null>(null);
  const [dateFrom,       setDateFrom]      = useState('');
  const [dateTo,         setDateTo]        = useState('');
  const [filter,         setFilter]        = useState<StatementFilter>('all');
  const [entries,        setEntries]       = useState<StatementEntry[]>([]);
  const [loading,        setLoading]       = useState(false);
  const [clientSearch,   setClientSearch]  = useState('');
  const [dataLoading,    setDataLoading]   = useState(true);
  const [hasGenerated,   setHasGenerated]  = useState(false);
  const [officeOpening,  setOfficeOpening] = useState(0);

  useEffect(() => {
    fetch('/api/clients')
      .then((r) => r.json())
      .then((data: Client[]) => {
        setClients(data ?? []);
        setDataLoading(false);
      });
  }, []);

  const filteredClients = clients.filter((c) =>
    c.name.toLowerCase().includes(clientSearch.toLowerCase())
  );

  const generateStatement = useCallback(async () => {
    if (reportScope === 'client' && !selectedClient) return;
    setLoading(true);
    setHasGenerated(false);

    if (reportScope === 'office') {
      const [operations, rawVouchers, officeClients] = await Promise.all([
        fetch('/api/contracts').then((response) => response.json()) as Promise<(Contract & { clients?: Client })[]>,
        fetch('/api/vouchers').then((response) => response.json()) as Promise<(Voucher & { clients?: Client })[]>,
        fetch('/api/clients').then((response) => response.json()) as Promise<Client[]>,
      ]);
      const openingTotal = (officeClients ?? []).reduce((sum, client) =>
        sum + (client.type === 'creditor' ? -Math.abs(client.opening_balance) : Math.abs(client.opening_balance)), 0);
      setOfficeOpening(openingTotal);
      const result: StatementEntry[] = [];
      for (const operation of operations ?? []) {
        if (dateFrom && operation.contract_date < dateFrom) continue;
        if (dateTo && operation.contract_date > dateTo) continue;
        if (filter === 'debit' && operation.operation_type !== 'debit_on_client') continue;
        if (filter === 'credit' && operation.operation_type !== 'credit_on_client') continue;
        result.push({
          date: operation.contract_date,
          operationNumber: operation.contract_number,
          operationType: operation.operation_type,
          description: `${operation.clients?.name ?? 'عميل'} - عملية رقم ${operation.contract_number}: ${operation.description}`,
          debit: operation.operation_type === 'debit_on_client' ? operation.total_amount : 0,
          credit: operation.operation_type === 'credit_on_client' ? operation.total_amount : 0,
          balance: 0,
        });
      }
      for (const voucher of rawVouchers ?? []) {
        if (dateFrom && voucher.payment_date < dateFrom) continue;
        if (dateTo && voucher.payment_date > dateTo) continue;
        if (filter === 'debit' && voucher.voucher_type !== 'payment') continue;
        if (filter === 'credit' && voucher.voucher_type !== 'receipt') continue;
        result.push({
          date: voucher.payment_date,
          voucherNumber: voucher.voucher_number,
          voucherType: voucher.voucher_type,
          description: `${voucher.clients?.name ?? 'عميل'} - ${voucher.voucher_type === 'receipt' ? 'سند قبض' : 'سند صرف'} رقم ${voucher.voucher_number}`,
          debit: voucher.voucher_type === 'payment' ? voucher.amount : 0,
          credit: voucher.voucher_type === 'receipt' ? voucher.amount : 0,
          balance: 0,
        });
      }
      result.sort((a, b) => a.date.localeCompare(b.date));
      let balance = openingTotal;
      for (const entry of result) {
        balance += entry.debit - entry.credit;
        entry.balance = balance;
      }
      setEntries(result);
      setHasGenerated(true);
      setLoading(false);
      return;
    }

    const params = new URLSearchParams({ client_id: selectedClient!.id, filter });
    if (dateFrom) params.set('date_from', dateFrom);
    if (dateTo)   params.set('date_to',   dateTo);

    const res = await fetch(`/api/reports?${params}`);
    const { operations, vouchers: rawVouchers } = await res.json() as {
      operations: Contract[];
      vouchers: Voucher[];
    };

    const result: StatementEntry[] = [];

    for (const op of (operations ?? [])) {
      if (op.operation_type === 'debit_on_client') {
        result.push({
          date:            op.contract_date,
          operationNumber: op.contract_number,
          operationType:   op.operation_type,
          description:     `عملية رقم ${op.contract_number}: ${op.description}`,
          debit:           op.total_amount,
          credit:          0,
          balance:         0,
        });
      } else {
        result.push({
          date:            op.contract_date,
          operationNumber: op.contract_number,
          operationType:   op.operation_type,
          description:     `عملية رقم ${op.contract_number}: ${op.description}`,
          debit:           0,
          credit:          op.total_amount,
          balance:         0,
        });
      }
    }

    for (const voucher of (rawVouchers ?? [])) {
      if (voucher.voucher_type === 'receipt') {
        result.push({
          date:          voucher.payment_date,
          voucherNumber: voucher.voucher_number,
          voucherType:   voucher.voucher_type,
          description:   voucher.description ?? `سند قبض رقم ${voucher.voucher_number}`,
          debit:         0,
          credit:        voucher.amount,
          balance:       0,
        });
      } else {
        result.push({
          date:          voucher.payment_date,
          voucherNumber: voucher.voucher_number,
          voucherType:   voucher.voucher_type,
          description:   voucher.description ?? `سند صرف رقم ${voucher.voucher_number}`,
          debit:         voucher.amount,
          credit:        0,
          balance:       0,
        });
      }
    }

    result.sort((a, b) => a.date.localeCompare(b.date));
    let bal = selectedClient!.type === 'creditor'
      ? -Math.abs(selectedClient!.opening_balance)
      : Math.abs(selectedClient!.opening_balance);
    for (const entry of result) {
      bal += entry.debit - entry.credit;
      entry.balance = bal;
    }

    setEntries(result);
    setHasGenerated(true);
    setLoading(false);
  }, [selectedClient, dateFrom, dateTo, filter, reportScope]);

  const totalDebit  = entries.reduce((s, r) => s + r.debit,  0);
  const totalCredit = entries.reduce((s, r) => s + r.credit, 0);
  const officeClient: Client = {
    id: 'office-account',
    name: 'الحساب العام للمكتب',
    phone: null,
    type: officeOpening < 0 ? 'creditor' : 'debtor',
    opening_balance: Math.abs(officeOpening),
    notes: null,
    created_at: '',
    updated_at: '',
  };
  const statementClient = reportScope === 'office' ? officeClient : selectedClient;
  const openingBalance = statementClient
    ? (statementClient.type === 'creditor' ? -Math.abs(statementClient.opening_balance) : Math.abs(statementClient.opening_balance))
    : 0;
  const finalBalance = entries.length > 0 ? entries[entries.length - 1].balance : openingBalance;
  const balanceStatement = finalBalance > 0
    ? (reportScope === 'office' ? 'صافي الرصيد المستحق للمكتب' : 'المبلغ المستحق على العميل للمكتب')
    : finalBalance < 0
      ? (reportScope === 'office' ? 'صافي الرصيد المستحق على المكتب' : 'المبلغ المستحق للعميل على المكتب')
      : 'الحساب مسدد ولا يوجد مبلغ مستحق لأي طرف';

  return (
    <MainLayout title="التقارير وكشوفات الحساب" subtitle="استخرج كشف حساب لأي عميل" permission="reports.view">
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-1 space-y-4">
          <div className="card p-5">
            <h2 className="text-base font-semibold text-gray-900 mb-3">نطاق كشف الحساب</h2>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => { setReportScope('client'); setEntries([]); setHasGenerated(false); }}
                className={`px-3 py-3 rounded-lg text-sm font-semibold ${reportScope === 'client' ? 'bg-indigo-600 text-white' : 'bg-gray-50 text-gray-700'}`}
              >
                كشف عميل
              </button>
              <button
                onClick={() => { setReportScope('office'); setEntries([]); setHasGenerated(false); }}
                className={`px-3 py-3 rounded-lg text-sm font-semibold ${reportScope === 'office' ? 'bg-indigo-600 text-white' : 'bg-gray-50 text-gray-700'}`}
              >
                كشف المكتب العام
              </button>
            </div>
            {reportScope === 'office' && (
              <p className="text-xs text-gray-500 leading-6 mt-3">
                يعرض جميع العمليات والسندات، ويبين صافي الرصيد المستحق للمكتب أو المستحق على المكتب.
              </p>
            )}
          </div>
          {reportScope === 'client' && (
          <div className="card p-5">
            <h2 className="text-base font-semibold text-gray-900 mb-4">اختر العميل</h2>
            <div className="relative mb-3">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                value={clientSearch}
                onChange={(e) => setClientSearch(e.target.value)}
                placeholder="بحث بالاسم..."
                className="input-field pr-9 text-sm"
              />
            </div>
            {dataLoading ? (
              <p className="text-sm text-gray-400 text-center py-4">جارٍ التحميل...</p>
            ) : (
              <ul className="max-h-64 overflow-y-auto divide-y divide-gray-50 border border-gray-100 rounded-lg">
                {filteredClients.map((client) => (
                  <li key={client.id}>
                    <button
                      onClick={() => { setSelectedClient(client); setEntries([]); setHasGenerated(false); }}
                      className={`w-full text-right px-3 py-2.5 text-sm transition-colors ${
                        selectedClient?.id === client.id
                          ? 'bg-indigo-50 text-indigo-700 font-semibold'
                          : 'hover:bg-gray-50 text-gray-700'
                      }`}
                    >
                      <p className="font-medium">{client.name}</p>
                      {client.phone && <p className="text-xs text-gray-400 mt-0.5">{client.phone}</p>}
                    </button>
                  </li>
                ))}
                {filteredClients.length === 0 && (
                  <li className="px-3 py-4 text-center text-sm text-gray-400">لا نتائج</li>
                )}
              </ul>
            )}
          </div>
          )}

          <div className="card p-5">
            <h2 className="text-base font-semibold text-gray-900 mb-3">نوع الكشف</h2>
            <div className="space-y-2">
              {([
                { val: 'all',    label: 'كشف كامل (كل الحركات)' },
                { val: 'debit',  label: 'مدين على العميل فقط' },
                { val: 'credit', label: 'دائن على المكتب فقط' },
              ] as const).map(({ val, label }) => (
                <button
                  key={val}
                  onClick={() => setFilter(val)}
                  className={`w-full text-right px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                    filter === val
                      ? 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                      : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="card p-5">
            <h2 className="text-base font-semibold text-gray-900 mb-3">نطاق التاريخ</h2>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">من تاريخ</label>
                <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="input-field text-sm" dir="ltr" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">إلى تاريخ</label>
                <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="input-field text-sm" dir="ltr" />
              </div>
            </div>
          </div>

          <button
            onClick={generateStatement}
            disabled={(reportScope === 'client' && !selectedClient) || loading}
            className="btn-primary w-full py-3"
          >
            {loading ? 'جارٍ إعداد المعاينة...' : 'معاينة التقرير'}
          </button>

          {hasGenerated && statementClient && (
            <div className="card p-4 space-y-2">
              <p className="text-xs font-semibold text-gray-500">ملخص الكشف</p>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">مدين (عليه):</span>
                <span className="font-semibold text-orange-600">{formatCurrency(totalDebit)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">دائن (له):</span>
                <span className="font-semibold text-purple-600">{formatCurrency(totalCredit)}</span>
              </div>
              <div className="flex justify-between text-sm border-t pt-2">
                <span className="text-gray-600 font-medium">الرصيد الختامي:</span>
                <span className={`font-bold ${finalBalance > 0 ? 'text-red-600' : finalBalance < 0 ? 'text-blue-600' : 'text-green-600'}`}>
                  {formatCurrency(Math.abs(finalBalance))}
                  {' '}
                  {finalBalance > 0 ? '(مدين)' : finalBalance < 0 ? '(دائن)' : '(مسدد)'}
                </span>
              </div>
              <div className="border-t pt-2 text-xs leading-6">
                <p className="text-gray-600"><span className="font-semibold">الرصيد كتابةً:</span> {tafqeet(Math.abs(finalBalance))}</p>
                <p className={`font-bold ${finalBalance > 0 ? 'text-red-700' : finalBalance < 0 ? 'text-blue-700' : 'text-green-700'}`}>
                  {balanceStatement}
                </p>
              </div>
            </div>
          )}
        </div>

        <div className="xl:col-span-2">
          {loading ? (
            <div className="card flex items-center justify-center py-32">
              <LoadingSpinner message="جارٍ استخراج كشف الحساب..." />
            </div>
          ) : reportScope === 'client' && !selectedClient ? (
            <div className="card flex flex-col items-center justify-center py-32 text-gray-400">
              <Search className="w-12 h-12 mb-3 text-gray-200" />
              <p className="text-base">اختر عميلاً من القائمة لاستخراج كشف حسابه</p>
            </div>
          ) : !hasGenerated ? (
            <div className="card flex flex-col items-center justify-center py-32 text-gray-400">
              <p className="text-base mb-1">اضغط &quot;معاينة التقرير&quot;</p>
              <p className="text-sm">سيظهر التقرير كاملاً بعدد صفحاته قبل الطباعة</p>
            </div>
          ) : (
            <div className="card p-4">
              <StatementPrint
                client={statementClient!}
                entries={entries}
                dateFrom={dateFrom || undefined}
                dateTo={dateTo || undefined}
                filter={filter}
              />
            </div>
          )}
        </div>
      </div>
    </MainLayout>
  );
}
