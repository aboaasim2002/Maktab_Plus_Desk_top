'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowRight, Edit2, Plus, Receipt, CreditCard, Printer } from 'lucide-react';
import MainLayout from '@/components/layout/MainLayout';
import Modal from '@/components/ui/Modal';
import ContractForm from '@/components/forms/ContractForm';
import VoucherForm from '@/components/forms/VoucherForm';
import VoucherPrint from '@/components/print/VoucherPrint';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import { Client, Contract, Voucher } from '@/lib/types';
import {
  formatCurrency, formatDate,
  getContractStatusLabel, getContractStatusClasses,
  getVoucherTypeLabel, getVoucherTypeClasses,
} from '@/lib/utils';

export default function ContractDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router  = useRouter();

  const [contract,      setContract]      = useState<(Contract & { clients?: Client }) | null>(null);
  const [vouchers,      setVouchers]      = useState<Voucher[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [showEdit,      setShowEdit]      = useState(false);
  const [showVoucher,   setShowVoucher]   = useState(false);
  const [printVoucher,  setPrintVoucher]  = useState<Voucher | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    const [contractData, voucherData] = await Promise.all([
      fetch(`/api/contracts/${id}`).then((r) => r.ok ? r.json() : null),
      fetch(`/api/vouchers?contract_id=${id}`).then((r) => r.json()),
    ]);
    setContract(contractData as (Contract & { clients?: Client }) | null);
    setVouchers(voucherData ?? []);
    setLoading(false);
  }, [id]);

  useEffect(() => { loadData(); }, [loadData]);

  if (loading) return <MainLayout title="جارٍ التحميل..." permission="operations.view"><LoadingSpinner /></MainLayout>;
  if (!contract) return (
    <MainLayout title="العقد غير موجود" permission="operations.view">
      <div className="text-center py-20">
        <p className="text-gray-500 mb-4">لم يُعثر على هذا العقد</p>
        <button onClick={() => router.push('/contracts')} className="btn-primary">العودة للعقود</button>
      </div>
    </MainLayout>
  );

  const totalPaid = vouchers
    .filter((v) => v.voucher_type === 'receipt')
    .reduce((s, v) => s + v.amount, 0);

  const progressPct = contract.total_amount > 0
    ? Math.min(100, (totalPaid / contract.total_amount) * 100)
    : 0;

  return (
    <MainLayout
      permission="operations.view"
      title={`عقد رقم ${contract.contract_number}`}
      subtitle={contract.clients?.name}
      actions={
        <div className="flex gap-2">
          <button onClick={() => router.push('/contracts')} className="btn-secondary flex items-center gap-1.5 text-xs">
            <ArrowRight className="w-3.5 h-3.5" /> رجوع
          </button>
          <button onClick={() => setShowEdit(true)} className="btn-secondary flex items-center gap-1.5 text-xs">
            <Edit2 className="w-3.5 h-3.5" /> تعديل
          </button>
          <button onClick={() => setShowVoucher(true)} className="btn-primary flex items-center gap-1.5 text-xs">
            <Plus className="w-3.5 h-3.5" /> إصدار سند
          </button>
        </div>
      }
    >
      {/* ── معلومات العقد ── */}
      <div className="card p-6 mb-6">
        <div className="flex flex-wrap justify-between gap-4 mb-4">
          <div>
            <p className="text-xs text-gray-500 mb-1">وصف العمل</p>
            <p className="text-base font-semibold text-gray-900">{contract.description}</p>
          </div>
          <span className={`badge ${getContractStatusClasses(contract.status)}`}>
            {getContractStatusLabel(contract.status)}
          </span>
        </div>

        {/* الأرقام المالية */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
          <div>
            <p className="text-xs text-gray-500">إجمالي العقد</p>
            <p className="text-lg font-bold text-gray-900">{formatCurrency(contract.total_amount)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">المُسدَّد</p>
            <p className="text-lg font-bold text-green-700">{formatCurrency(totalPaid)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">المتبقي</p>
            <p className={`text-lg font-bold ${(contract.total_amount - totalPaid) > 0 ? 'text-red-600' : 'text-green-600'}`}>
              {formatCurrency(contract.total_amount - totalPaid)}
            </p>
          </div>
          <div>
            <p className="text-xs text-gray-500">تاريخ العقد</p>
            <p className="text-sm font-semibold text-gray-700">{formatDate(contract.contract_date)}</p>
          </div>
        </div>

        {/* شريط التقدم */}
        <div>
          <div className="flex justify-between text-xs text-gray-500 mb-1">
            <span>نسبة الإنجاز المالي</span>
            <span>{progressPct.toFixed(1)}%</span>
          </div>
          <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full bg-green-500 transition-all duration-500"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>

        {/* ملاحظات */}
        {contract.notes && (
          <p className="mt-3 text-sm text-gray-500 italic border-t border-gray-100 pt-3">
            {contract.notes}
          </p>
        )}
      </div>

      {/* ── سندات العقد ── */}
      <div className="card">
        <div className="card-header">
          <div className="flex items-center gap-2">
            <Receipt className="w-5 h-5 text-gray-400" />
            <h3 className="text-base font-semibold text-gray-900">
              السندات الصادرة ({vouchers.length})
            </h3>
          </div>
          <Link href={`/clients/${contract.client_id}`} className="text-indigo-600 hover:text-indigo-800 text-sm">
            ملف العميل
          </Link>
        </div>

        {vouchers.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-14 text-gray-400">
            <CreditCard className="w-10 h-10 mb-2 text-gray-200" />
            <p className="text-sm">لم يُصدر أي سند لهذا العقد بعد</p>
            <button onClick={() => setShowVoucher(true)} className="btn-primary mt-4 text-sm">
              إصدار أول سند
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="text-right px-4 py-3 font-semibold text-gray-600">رقم السند</th>
                  <th className="text-right px-4 py-3 font-semibold text-gray-600">النوع</th>
                  <th className="text-right px-4 py-3 font-semibold text-gray-600 hidden sm:table-cell">التاريخ</th>
                  <th className="text-right px-4 py-3 font-semibold text-gray-600 hidden md:table-cell">البيان</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">المبلغ</th>
                  <th className="text-right px-4 py-3 font-semibold text-gray-600 hidden lg:table-cell">كتابةً</th>
                  <th className="w-12"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {vouchers.map((voucher) => (
                  <tr key={voucher.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 font-mono font-semibold text-gray-900">
                      {voucher.voucher_number}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`badge ${getVoucherTypeClasses(voucher.voucher_type)}`}>
                        {getVoucherTypeLabel(voucher.voucher_type)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-500 hidden sm:table-cell">
                      {formatDate(voucher.payment_date)}
                    </td>
                    <td className="px-4 py-3 text-gray-600 hidden md:table-cell max-w-[180px] truncate">
                      {voucher.description ?? '—'}
                    </td>
                    <td
                      className={`px-4 py-3 text-left font-bold ${
                        voucher.voucher_type === 'receipt' ? 'text-green-700' : 'text-red-700'
                      }`}
                    >
                      {formatCurrency(voucher.amount)}
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs hidden lg:table-cell max-w-[200px] truncate">
                      {voucher.amount_text}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => setPrintVoucher(voucher)}
                        className="p-1.5 text-gray-300 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition"
                        title="طباعة السند"
                      >
                        <Printer className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* نافذة التعديل */}
      <Modal isOpen={showEdit} onClose={() => setShowEdit(false)} title="تعديل بيانات العقد" size="lg">
        <ContractForm
          contract={contract}
          onSuccess={() => { setShowEdit(false); loadData(); }}
          onCancel={() => setShowEdit(false)}
        />
      </Modal>

      {/* نافذة إصدار سند */}
      <Modal isOpen={showVoucher} onClose={() => setShowVoucher(false)} title="إصدار سند جديد" size="lg">
        {contract.clients && (
          <VoucherForm
            client={contract.clients}
            onSuccess={() => { setShowVoucher(false); loadData(); }}
            onCancel={() => setShowVoucher(false)}
          />
        )}
      </Modal>

      {/* نافذة طباعة سند */}
      <Modal
        isOpen={!!printVoucher}
        onClose={() => setPrintVoucher(null)}
        title={`طباعة السند رقم ${printVoucher?.voucher_number}`}
        size="lg"
      >
        {printVoucher && (
          <VoucherPrint
            voucher={{ ...printVoucher, contracts: { ...contract, clients: contract.clients } } as Voucher}
          />
        )}
      </Modal>
    </MainLayout>
  );
}
