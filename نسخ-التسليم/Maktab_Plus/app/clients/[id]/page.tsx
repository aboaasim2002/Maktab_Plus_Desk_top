'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowRight, Edit2, Plus, Phone, Receipt } from 'lucide-react';
import MainLayout from '@/components/layout/MainLayout';
import Modal from '@/components/ui/Modal';
import ClientForm from '@/components/forms/ClientForm';
import ContractForm from '@/components/forms/ContractForm';
import VoucherForm from '@/components/forms/VoucherForm';
import VoucherPrint from '@/components/print/VoucherPrint';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import { Client, Contract, Voucher } from '@/lib/types';
import {
  formatCurrency, formatDate,
  getContractStatusLabel, getContractStatusClasses,
  getOperationTypeLabel, getOperationTypeClasses,
  getVoucherTypeLabel, getVoucherTypeClasses,
} from '@/lib/utils';

export default function ClientProfilePage() {
  const { id } = useParams<{ id: string }>();
  const router  = useRouter();

  const [client,    setClient]    = useState<Client | null>(null);
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [vouchers,  setVouchers]  = useState<Voucher[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [showEdit,        setShowEdit]        = useState(false);
  const [showAddContract, setShowAddContract] = useState(false);
  const [showAddVoucher,  setShowAddVoucher]  = useState(false);
  const [printVoucher,    setPrintVoucher]    = useState<Voucher | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    const [clientData, contractsData, vouchersData] = await Promise.all([
      fetch(`/api/clients/${id}`).then((r) => r.ok ? r.json() : null),
      fetch(`/api/contracts?client_id=${id}`).then((r) => r.json()),
      fetch(`/api/vouchers?client_id=${id}`).then((r) => r.json()),
    ]);
    setClient(clientData);
    setContracts(contractsData ?? []);
    setVouchers(vouchersData ?? []);
    setLoading(false);
  }, [id]);

  useEffect(() => { loadData(); }, [loadData]);

  if (loading) return <MainLayout title="جارٍ التحميل..." permission="clients.view"><LoadingSpinner /></MainLayout>;
  if (!client) return (
    <MainLayout title="العميل غير موجود" permission="clients.view">
      <div className="text-center py-20">
        <p className="text-gray-500 mb-4">لم يُعثر على بيانات هذا العميل</p>
        <button onClick={() => router.push('/clients')} className="btn-primary">
          العودة للعملاء
        </button>
      </div>
    </MainLayout>
  );

  // ── حساب الأرصدة ──
  const totalDebitOps   = contracts.filter(c => c.operation_type === 'debit_on_client').reduce((s, c) => s + c.total_amount, 0);
  const totalCreditOps  = contracts.filter(c => c.operation_type === 'credit_on_client').reduce((s, c) => s + c.total_amount, 0);
  const totalReceipts   = vouchers.filter(v => v.voucher_type === 'receipt').reduce((s, v) => s + v.amount, 0);
  const totalPayments   = vouchers.filter(v => v.voucher_type === 'payment').reduce((s, v) => s + v.amount, 0);
  const clientOwesOffice = totalDebitOps - totalReceipts;
  const officeOwesClient = totalCreditOps - totalPayments;
  const netBalance = clientOwesOffice - officeOwesClient;

  return (
    <MainLayout
      permission="clients.view"
      title={client.name}
      subtitle={`${contracts.length} عملية · ${vouchers.length} سند`}
      actions={
        <div className="flex gap-2">
          <button onClick={() => router.push('/clients')} className="btn-secondary flex items-center gap-1.5 text-xs">
            <ArrowRight className="w-3.5 h-3.5" /> رجوع
          </button>
          <button onClick={() => setShowEdit(true)} className="btn-secondary flex items-center gap-1.5 text-xs">
            <Edit2 className="w-3.5 h-3.5" /> تعديل
          </button>
          <button onClick={() => setShowAddContract(true)} className="btn-secondary flex items-center gap-1.5 text-xs">
            <Plus className="w-3.5 h-3.5" /> عملية جديدة
          </button>
          <button onClick={() => setShowAddVoucher(true)} className="btn-primary flex items-center gap-1.5 text-xs">
            <Receipt className="w-3.5 h-3.5" /> إصدار سند
          </button>
        </div>
      }
    >
      {/* بطاقة معلومات العميل */}
      <div className="card mb-6 p-6">
        <div className="flex flex-wrap gap-6 items-start">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-indigo-100 flex items-center justify-center flex-shrink-0">
              <span className="text-indigo-700 font-bold text-2xl">{client.name.charAt(0)}</span>
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900">{client.name}</h2>
              {client.phone && (
                <div className="flex items-center gap-1.5 text-gray-500 text-sm mt-1">
                  <Phone className="w-4 h-4 text-gray-400" />
                  <span dir="ltr">{client.phone}</span>
                </div>
              )}
              {client.notes && <p className="text-sm text-gray-400 italic mt-1">{client.notes}</p>}
            </div>
          </div>
        </div>
      </div>

      {/* لوحة الأرصدة */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="card p-5 border-r-4 border-orange-400">
          <p className="text-xs text-gray-500 mb-1">ما على العميل للمكتب</p>
          <p className="text-2xl font-bold text-orange-600">{formatCurrency(Math.max(0, clientOwesOffice))}</p>
          <p className="text-xs text-gray-400 mt-1">عمليات مدينة: {formatCurrency(totalDebitOps)} − مقبوضات: {formatCurrency(totalReceipts)}</p>
        </div>
        <div className="card p-5 border-r-4 border-purple-400">
          <p className="text-xs text-gray-500 mb-1">ما على المكتب للعميل</p>
          <p className="text-2xl font-bold text-purple-600">{formatCurrency(Math.max(0, officeOwesClient))}</p>
          <p className="text-xs text-gray-400 mt-1">عمليات دائنة: {formatCurrency(totalCreditOps)} − مدفوعات: {formatCurrency(totalPayments)}</p>
        </div>
        <div className={`card p-5 border-r-4 ${netBalance > 0 ? 'border-red-400' : netBalance < 0 ? 'border-blue-400' : 'border-green-400'}`}>
          <p className="text-xs text-gray-500 mb-1">الرصيد الصافي</p>
          <p className={`text-2xl font-bold ${netBalance > 0 ? 'text-red-600' : netBalance < 0 ? 'text-blue-600' : 'text-green-600'}`}>
            {formatCurrency(Math.abs(netBalance))}
          </p>
          <p className="text-xs text-gray-400 mt-1">
            {netBalance > 0 ? 'العميل مدين للمكتب' : netBalance < 0 ? 'المكتب مدين للعميل' : 'الحساب مسوّى ✓'}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* قائمة العمليات */}
        <div className="card">
          <div className="card-header">
            <h3 className="text-base font-semibold text-gray-900">العمليات</h3>
            <span className="text-xs text-gray-400">{contracts.length} عملية</span>
          </div>
          {contracts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-gray-400">
              <p className="text-sm">لا توجد عمليات بعد</p>
            </div>
          ) : (
            <ul className="divide-y divide-gray-50">
              {contracts.map((contract) => (
                <li key={contract.id}>
                  <Link
                    href={`/contracts/${contract.id}`}
                    className="flex items-center justify-between px-5 py-3.5 hover:bg-gray-50 transition-colors group"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-xs text-gray-400 font-mono">#{contract.contract_number}</span>
                        <span className={`badge text-xs ${getOperationTypeClasses(contract.operation_type)}`}>
                          {getOperationTypeLabel(contract.operation_type)}
                        </span>
                        <span className={`badge text-xs ${getContractStatusClasses(contract.status)}`}>
                          {getContractStatusLabel(contract.status)}
                        </span>
                      </div>
                      <p className="text-sm text-gray-700 truncate">{contract.description}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{formatDate(contract.contract_date)}</p>
                    </div>
                    <p className={`text-sm font-bold mr-3 flex-shrink-0 ${contract.operation_type === 'debit_on_client' ? 'text-orange-600' : 'text-purple-600'}`}>
                      {formatCurrency(contract.total_amount)}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* قائمة السندات */}
        <div className="card">
          <div className="card-header">
            <h3 className="text-base font-semibold text-gray-900">السندات</h3>
            <span className="text-xs text-gray-400">{vouchers.length} سند</span>
          </div>
          {vouchers.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-gray-400">
              <p className="text-sm">لا توجد سندات بعد</p>
            </div>
          ) : (
            <ul className="divide-y divide-gray-50">
              {vouchers.map((voucher) => (
                <li key={voucher.id} className="flex items-center justify-between px-5 py-3.5 hover:bg-gray-50">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-xs text-gray-400 font-mono">#{voucher.voucher_number}</span>
                      <span className={`badge text-xs ${getVoucherTypeClasses(voucher.voucher_type)}`}>
                        {getVoucherTypeLabel(voucher.voucher_type)}
                      </span>
                    </div>
                    {voucher.description && <p className="text-sm text-gray-700 truncate">{voucher.description}</p>}
                    <p className="text-xs text-gray-400 mt-0.5">{formatDate(voucher.payment_date)}</p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0 mr-3">
                    <p className={`text-sm font-bold ${voucher.voucher_type === 'receipt' ? 'text-green-600' : 'text-red-600'}`}>
                      {formatCurrency(voucher.amount)}
                    </p>
                    <button
                      onClick={() => setPrintVoucher(voucher)}
                      className="text-gray-400 hover:text-indigo-600 transition-colors"
                      title="طباعة"
                    >
                      <Receipt className="w-4 h-4" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* نوافذ */}
      <Modal isOpen={showEdit} onClose={() => setShowEdit(false)} title="تعديل بيانات العميل">
        <ClientForm
          client={client}
          onSuccess={() => { setShowEdit(false); loadData(); }}
          onCancel={() => setShowEdit(false)}
        />
      </Modal>

      <Modal isOpen={showAddContract} onClose={() => setShowAddContract(false)} title="إضافة عملية جديدة" size="lg">
        <ContractForm
          preselectedClientId={id}
          onSuccess={() => { setShowAddContract(false); loadData(); }}
          onCancel={() => setShowAddContract(false)}
        />
      </Modal>

      <Modal isOpen={showAddVoucher} onClose={() => setShowAddVoucher(false)} title="إصدار سند" size="lg">
        <VoucherForm
          client={client}
          onSuccess={() => { setShowAddVoucher(false); loadData(); }}
          onCancel={() => setShowAddVoucher(false)}
        />
      </Modal>

      {printVoucher && (
        <Modal isOpen={!!printVoucher} onClose={() => setPrintVoucher(null)} title="طباعة السند" size="lg">
          <VoucherPrint voucher={printVoucher} />
        </Modal>
      )}
    </MainLayout>
  );
}
