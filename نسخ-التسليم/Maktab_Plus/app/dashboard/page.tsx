'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  TrendingUp, TrendingDown, FileText, Users,
  ChevronLeft, CheckCircle, DatabaseBackup, Building2, MapPin, Receipt, Clock3,
} from 'lucide-react';
import MainLayout from '@/components/layout/MainLayout';
import StatCard from '@/components/ui/StatCard';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import { Client, Contract, DashboardStats } from '@/lib/types';
import {
  formatCurrency, formatDate,
  getContractStatusLabel, getContractStatusClasses,
  getOperationTypeClasses, getOperationTypeLabel,
} from '@/lib/utils';
import useOfficeSettings from '@/lib/useOfficeSettings';
import { useAuth } from '@/components/auth/AuthProvider';

export default function DashboardPage() {
  const { officeName, officeAddress } = useOfficeSettings();
  const { user } = useAuth();
  const [stats,             setStats]            = useState<DashboardStats | null>(null);
  const [topDebtorClients,  setTopDebtorClients] = useState<(Client & { balance: number })[]>([]);
  const [recentContracts,   setRecentContracts]  = useState<Contract[]>([]);
  const [todayInvoices, setTodayInvoices] = useState({ invoice_count: 0, total_amount: 0 });
  const [trialStatus,       setTrialStatus]      = useState<{
    isTrial: boolean;
    valid: boolean;
    daysRemaining: number;
    expiresAt: string | null;
  } | null>(null);
  const [backupMsg,         setBackupMsg]        = useState('');

  const trialDaysText = trialStatus
    ? trialStatus.daysRemaining === 1
      ? 'يوم واحد'
      : `${trialStatus.daysRemaining} أيام`
    : '';

  async function handleBackup() {
    const response = await fetch('/api/database/backup');
    if (!response.ok) {
      const result = await response.json().catch(() => ({ error: 'تعذر إنشاء النسخة الاحتياطية' }));
      setBackupMsg(result.error);
      setTimeout(() => setBackupMsg(''), 4000);
      return;
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `maktab-plus-organization-${new Date().toISOString().slice(0, 10)}.sql`;
    link.click();
    URL.revokeObjectURL(url);
    setBackupMsg('تم تنزيل النسخة الاحتياطية بنجاح');
    setTimeout(() => setBackupMsg(''), 4000);
  }
  const [loading,           setLoading]          = useState(true);

  const loadData = useCallback(async () => {
    setLoading(true);

    const [contractsRes, clientsRes, vouchersRes, invoiceSummaryRes] = await Promise.all([
      fetch('/api/contracts').then((r) => r.ok ? r.json() : []),
      fetch('/api/clients').then((r) => r.ok ? r.json() : []),
      fetch('/api/vouchers').then((r) => r.ok ? r.json() : []),
      fetch('/api/dashboard/invoice-summary').then((r) => r.ok ? r.json() : ({ invoice_count: 0, total_amount: 0 })),
    ]);

    const contracts = Array.isArray(contractsRes) ? contractsRes as (Contract & { clients?: Client })[] : [];
    const clients   = Array.isArray(clientsRes) ? clientsRes as Client[] : [];
    const vouchers  = Array.isArray(vouchersRes) ? vouchersRes as Array<{ client_id: string; voucher_type: string; amount: number }> : [];
    setTodayInvoices(invoiceSummaryRes);

    let totalDebitOps  = 0;
    let totalCreditOps = 0;
    let activeOps      = 0;
    let completedOps   = 0;

    const clientOpsMap: Record<string, { debit: number; credit: number }> = {};

    for (const c of contracts) {
      if (c.status === 'active')    activeOps++;
      if (c.status === 'completed') completedOps++;

      if (!clientOpsMap[c.client_id]) clientOpsMap[c.client_id] = { debit: 0, credit: 0 };
      if (c.operation_type === 'debit_on_client') {
        totalDebitOps += c.total_amount;
        clientOpsMap[c.client_id].debit += c.total_amount;
      } else {
        totalCreditOps += c.total_amount;
        clientOpsMap[c.client_id].credit += c.total_amount;
      }
    }

    const clientVouchersMap: Record<string, { receipts: number; payments: number }> = {};
    for (const v of vouchers) {
      if (!clientVouchersMap[v.client_id]) clientVouchersMap[v.client_id] = { receipts: 0, payments: 0 };
      if (v.voucher_type === 'receipt') clientVouchersMap[v.client_id].receipts += v.amount;
      else                              clientVouchersMap[v.client_id].payments += v.amount;
    }

    let totalReceivables = 0;
    let totalPayables    = 0;
    for (const client of clients) {
      const ops = clientOpsMap[client.id] ?? { debit: 0, credit: 0 };
      const vch = clientVouchersMap[client.id] ?? { receipts: 0, payments: 0 };
      const opening = client.type === 'creditor'
        ? -Math.abs(client.opening_balance)
        : Math.abs(client.opening_balance);
      const balance = opening + ops.debit - ops.credit - vch.receipts + vch.payments;
      if (balance > 0) totalReceivables += balance;
      if (balance < 0) totalPayables += Math.abs(balance);
    }

    setStats({ totalReceivables, totalPayables, activeOperations: activeOps, completedOperations: completedOps, totalClients: clients.length });

    const debtors = clients
      .map((cl) => {
        const ops = clientOpsMap[cl.id] ?? { debit: 0, credit: 0 };
        const vch = clientVouchersMap[cl.id] ?? { receipts: 0, payments: 0 };
        const opening = cl.type === 'creditor'
          ? -Math.abs(cl.opening_balance)
          : Math.abs(cl.opening_balance);
        return { ...cl, balance: Math.max(0, opening + ops.debit - ops.credit - vch.receipts + vch.payments) };
      })
      .filter((cl) => cl.balance > 0)
      .sort((a, b) => b.balance - a.balance);

    setTopDebtorClients(debtors);
    setRecentContracts(contracts.slice(0, 8));
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  useEffect(() => {
    let active = true;

    fetch('/api/trial-status')
      .then((response) => response.json())
      .then((status: typeof trialStatus) => {
        if (active && status?.isTrial) setTrialStatus(status);
      })
      .catch(() => {
        if (active) setTrialStatus(null);
      });

    return () => { active = false; };
  }, []);

  if (loading) return (
    <MainLayout title="لوحة التحكم" permission="dashboard.view">
      <LoadingSpinner />
    </MainLayout>
  );

  return (
    <MainLayout
      permission="dashboard.view"
      title="لوحة التحكم"
      subtitle="نظرة عامة على الوضع المالي للمكتب"
      actions={
        <div className="flex gap-2 items-center">
          {backupMsg && <span className="text-xs text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-1.5">{backupMsg}</span>}
          {(user?.role === 'office_owner' || (user?.role === 'platform_owner' && user.is_impersonating)) && (
            <button onClick={handleBackup} className="btn-secondary flex items-center gap-1.5 text-xs" title="أخذ نسخة احتياطية لبيانات المنشأة">
              <DatabaseBackup className="w-3.5 h-3.5" /> أخذ نسخة احتياطية
            </button>
          )}
        </div>
      }
    >
      {trialStatus?.isTrial && (
        <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-5 py-4 text-amber-900">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-amber-100 flex items-center justify-center flex-shrink-0">
              <Clock3 className="w-5 h-5 text-amber-700" />
            </div>
            <div>
              <p className="font-bold">هذه نسخة تجريبية</p>
              <p className="text-sm mt-1">
                تبقى لديك {trialDaysText} من مدة التجربة.
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="card p-5 mb-6 border-r-4 border-indigo-500">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-indigo-100 flex items-center justify-center">
            <Building2 className="w-6 h-6 text-indigo-700" />
          </div>
          <div>
            <p className="text-xs text-gray-500 mb-1">بيانات المكتب</p>
            <h2 className="text-lg font-bold text-gray-900">{officeName}</h2>
            {officeAddress && (
              <p className="text-sm text-gray-500 mt-1 flex items-center gap-1.5">
                <MapPin className="w-4 h-4" />
                {officeAddress}
              </p>
            )}
          </div>
        </div>
      </div>

      <Link href="/invoices" className="card p-5 mb-6 border-r-4 border-emerald-500 block hover:shadow-md transition-shadow">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-emerald-100 flex items-center justify-center">
              <Receipt className="w-6 h-6 text-emerald-700" />
            </div>
            <div>
              <p className="text-sm text-gray-500">فواتير اليوم</p>
              <p className="text-2xl font-bold text-gray-900">{todayInvoices.invoice_count} فاتورة</p>
            </div>
          </div>
          <div className="text-left">
            <p className="text-sm text-gray-500">إجمالي مبالغ اليوم</p>
            <p className="text-2xl font-bold text-emerald-700">{formatCurrency(todayInvoices.total_amount)}</p>
          </div>
        </div>
      </Link>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-8">
        <StatCard
          title="مستحقات المكتب (صافي)"
          value={formatCurrency(stats?.totalReceivables ?? 0)}
          subtitle="ما على العملاء للمكتب"
          variant="positive"
          icon={<TrendingUp className="w-full h-full" />}
        />
        <StatCard
          title="مستحقات على المكتب (صافي)"
          value={formatCurrency(stats?.totalPayables ?? 0)}
          subtitle="ما على المكتب للعملاء"
          variant="negative"
          icon={<TrendingDown className="w-full h-full" />}
        />
        <StatCard
          title="العمليات النشطة"
          value={stats?.activeOperations ?? 0}
          subtitle={`${stats?.completedOperations ?? 0} عملية مكتملة`}
          variant="info"
          icon={<FileText className="w-full h-full" />}
        />
        <StatCard
          title="إجمالي العملاء"
          value={stats?.totalClients ?? 0}
          subtitle="عملاء مسجّلون"
          variant="neutral"
          icon={<Users className="w-full h-full" />}
        />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="card">
          <div className="card-header">
            <h2 className="text-base font-semibold text-gray-900">العملاء المدينون — الأعلى رصيداً</h2>
            <Link href="/clients" className="text-indigo-600 hover:text-indigo-800 text-sm font-medium">
              عرض الكل
            </Link>
          </div>
          {topDebtorClients.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-gray-400">
              <CheckCircle className="w-10 h-10 mb-2 text-green-300" />
              <p className="text-sm">لا توجد أرصدة مستحقة حالياً</p>
            </div>
          ) : (
            <ul className="divide-y divide-gray-50">
              {topDebtorClients.map((client) => (
                <li key={client.id}>
                  <Link
                    href={`/clients/${client.id}`}
                    className="flex items-center justify-between px-6 py-3.5 hover:bg-gray-50 transition-colors group"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-9 h-9 rounded-full bg-orange-100 flex items-center justify-center flex-shrink-0">
                        <span className="text-orange-700 font-bold text-sm">{client.name.charAt(0)}</span>
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-gray-900 truncate">{client.name}</p>
                        <p className="text-xs text-gray-400">{client.phone ?? 'بدون هاتف'}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      <span className="text-sm font-bold text-orange-600">
                        {formatCurrency(client.balance)}
                      </span>
                      <ChevronLeft className="w-4 h-4 text-gray-300 group-hover:text-indigo-500 transition" />
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="card">
          <div className="card-header">
            <h2 className="text-base font-semibold text-gray-900">آخر العمليات</h2>
            <Link href="/contracts" className="text-indigo-600 hover:text-indigo-800 text-sm font-medium">
              عرض الكل
            </Link>
          </div>
          {recentContracts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-gray-400">
              <FileText className="w-10 h-10 mb-2 text-gray-200" />
              <p className="text-sm">لا توجد عمليات بعد</p>
            </div>
          ) : (
            <ul className="divide-y divide-gray-50">
              {recentContracts.map((contract) => {
                const c = contract as Contract & { clients?: Client };
                return (
                  <li key={contract.id}>
                    <Link
                      href={`/contracts/${contract.id}`}
                      className="flex items-center justify-between px-6 py-3.5 hover:bg-gray-50 transition-colors group"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="text-xs text-gray-400 font-mono">#{contract.contract_number}</span>
                          <span className={`badge text-xs ${getOperationTypeClasses(contract.operation_type)}`}>
                            {getOperationTypeLabel(contract.operation_type)}
                          </span>
                          <span className={`badge text-xs ${getContractStatusClasses(contract.status)}`}>
                            {getContractStatusLabel(contract.status)}
                          </span>
                        </div>
                        <p className="text-sm font-medium text-gray-900 truncate">{contract.description}</p>
                        <p className="text-xs text-gray-400 mt-0.5">
                          {c.clients?.name} · {formatDate(contract.contract_date)}
                        </p>
                      </div>
                      <div className="text-left mr-3 flex-shrink-0">
                        <p className={`text-sm font-bold ${contract.operation_type === 'debit_on_client' ? 'text-orange-600' : 'text-purple-600'}`}>
                          {formatCurrency(contract.total_amount)}
                        </p>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

    </MainLayout>
  );
}
