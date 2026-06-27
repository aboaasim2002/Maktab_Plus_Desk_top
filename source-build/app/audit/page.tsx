'use client';

import { useCallback, useEffect, useState } from 'react';
import MainLayout from '@/components/layout/MainLayout';

interface Log {
  id: string;
  arabic_name?: string;
  username?: string;
  action: string;
  entity_type: string;
  entity_id?: string;
  details?: string;
  created_at: string;
}

const actionLabels: Record<string, string> = {
  login: 'تسجيل دخول', logout: 'تسجيل خروج', create: 'إضافة', update: 'تعديل', delete: 'حذف',
};
const entityLabels: Record<string, string> = {
  session: 'جلسة', user: 'مستخدم', invoice: 'فاتورة', service: 'خدمة',
  client: 'عميل', contract: 'عملية', voucher: 'سند', settings: 'بيانات المكتب',
};

export default function AuditPage() {
  const [logs, setLogs] = useState<Log[]>([]);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const load = useCallback(async () => {
    const params = new URLSearchParams();
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    const response = await fetch(`/api/audit?${params}`);
    if (response.ok) setLogs(await response.json());
  }, [from, to]);
  useEffect(() => { load(); }, [load]);

  return (
    <MainLayout title="سجل العمليات" subtitle="من قام بالإضافة أو التعديل أو الحذف ووقت العملية" permission="audit.view">
      <div className="card">
        <div className="p-5 border-b flex flex-wrap items-end gap-3">
          <label><span className="block text-sm mb-1">من تاريخ</span><input type="date" className="input-field" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
          <label><span className="block text-sm mb-1">إلى تاريخ</span><input type="date" className="input-field" value={to} onChange={(e) => setTo(e.target.value)} /></label>
          <button onClick={load} className="btn-primary">تحديث السجل</button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-100"><tr><th className="p-3">التاريخ والوقت</th><th className="p-3 text-right">المستخدم</th><th className="p-3">العملية</th><th className="p-3">القسم</th><th className="p-3 text-right">التفاصيل</th></tr></thead>
            <tbody className="divide-y">
              {logs.map((log) => <tr key={log.id}>
                <td className="p-3 text-center whitespace-nowrap" dir="ltr">{log.created_at}</td>
                <td className="p-3"><span className="font-semibold">{log.arabic_name || 'مستخدم محذوف'}</span><span className="text-gray-400 mr-2" dir="ltr">@{log.username}</span></td>
                <td className="p-3 text-center">{actionLabels[log.action] || log.action}</td>
                <td className="p-3 text-center">{entityLabels[log.entity_type] || log.entity_type}</td>
                <td className="p-3 text-xs text-gray-500 max-w-sm truncate" title={log.details || ''}>{log.details || '—'}</td>
              </tr>)}
              {!logs.length && <tr><td colSpan={5} className="p-10 text-center text-gray-400">لا توجد عمليات مسجلة</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </MainLayout>
  );
}
