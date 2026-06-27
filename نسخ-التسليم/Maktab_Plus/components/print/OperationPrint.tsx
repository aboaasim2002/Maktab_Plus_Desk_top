'use client';

import { Printer } from 'lucide-react';
import { Client, Contract } from '@/lib/types';
import { formatCurrency, formatDateShort } from '@/lib/utils';
import useOfficeSettings from '@/lib/useOfficeSettings';

interface OperationPrintProps {
  operation: Contract;
  client: Client;
}

export default function OperationPrint({ operation, client }: OperationPrintProps) {
  const settings = useOfficeSettings();
  const operationLabel = operation.operation_type === 'debit_on_client'
    ? 'مدين على العميل / للمكتب'
    : 'مدين على المكتب / دائن للعميل';

  function handlePrint() {
    const html = `
      <!doctype html>
      <html lang="ar" dir="rtl">
        <head>
          <meta charset="utf-8" />
          <title>تفاصيل العملية رقم ${operation.contract_number}</title>
          <style>
            @page { size: A4; margin: 18mm; }
            * { box-sizing: border-box; }
            body { font-family: Arial, sans-serif; color: #111827; margin: 0; direction: rtl; }
            .sheet { width: 100%; min-height: 250mm; border: 2px solid #1f2937; padding: 18mm; }
            h1, h2 { text-align: center; margin: 0; }
            h2 { margin-top: 8px; font-size: 18px; }
            table { width: 100%; border-collapse: collapse; margin-top: 28px; font-size: 14px; }
            td { border: 1px solid #6b7280; padding: 12px; vertical-align: top; }
            .label { width: 24%; background: #f3f4f6; font-weight: bold; }
            .description { min-height: 90px; line-height: 1.9; font-size: 16px; white-space: pre-wrap; }
            .amount { font-size: 22px; font-weight: bold; color: #7f1d1d; }
            .signatures { display: grid; grid-template-columns: 1fr 1fr; gap: 60px; margin-top: 70px; text-align: center; }
            .signature { border-top: 2px solid #9ca3af; padding-top: 10px; }
          </style>
        </head>
        <body>
          <div class="sheet">
            <h1>${settings.officeName}</h1>
            ${settings.officeAddress ? `<p style="text-align:center">${settings.officeAddress}</p>` : ''}
            <h2>تفاصيل العملية رقم ${operation.contract_number}</h2>
            <table>
              <tr><td class="label">العميل</td><td>${client.name}</td><td class="label">التاريخ</td><td dir="ltr">${formatDateShort(operation.contract_date)}</td></tr>
              <tr><td class="label">نوع العملية</td><td colspan="3">${operationLabel}</td></tr>
              <tr><td class="label">المبلغ</td><td colspan="3" class="amount">${formatCurrency(operation.total_amount)}</td></tr>
              <tr><td class="label">بيان العملية</td><td colspan="3"><div class="description">${operation.description}</div></td></tr>
              ${operation.notes ? `<tr><td class="label">ملاحظات</td><td colspan="3">${operation.notes}</td></tr>` : ''}
            </table>
            <div class="signatures"><div class="signature">المسؤول المالي</div><div class="signature">المدير العام</div></div>
          </div>
          <script>window.onload=()=>window.print();</script>
        </body>
      </html>`;
    const printWindow = window.open('', '_blank', 'width=900,height=900');
    if (!printWindow) return;
    printWindow.document.write(html);
    printWindow.document.close();
  }

  return (
    <div className="space-y-5">
      <div className="flex justify-end">
        <button onClick={handlePrint} className="btn-primary flex items-center gap-2">
          <Printer className="w-4 h-4" /> طباعة العملية
        </button>
      </div>
      <div className="border-2 border-gray-800 rounded-lg p-6">
        <h2 className="text-xl font-bold text-center mb-6">تفاصيل العملية رقم {operation.contract_number}</h2>
        <dl className="grid grid-cols-[140px_1fr] border border-gray-300 text-sm">
          <dt className="bg-gray-50 border-b border-l border-gray-300 p-3 font-bold">العميل</dt>
          <dd className="border-b border-gray-300 p-3">{client.name}</dd>
          <dt className="bg-gray-50 border-b border-l border-gray-300 p-3 font-bold">التاريخ</dt>
          <dd className="border-b border-gray-300 p-3" dir="ltr">{formatDateShort(operation.contract_date)}</dd>
          <dt className="bg-gray-50 border-b border-l border-gray-300 p-3 font-bold">النوع</dt>
          <dd className="border-b border-gray-300 p-3">{operationLabel}</dd>
          <dt className="bg-gray-50 border-b border-l border-gray-300 p-3 font-bold">المبلغ</dt>
          <dd className="border-b border-gray-300 p-3 text-xl font-bold text-red-900">{formatCurrency(operation.total_amount)}</dd>
          <dt className="bg-gray-50 border-l border-gray-300 p-3 font-bold">البيان</dt>
          <dd className="p-3 text-base leading-8 whitespace-pre-wrap">{operation.description}</dd>
        </dl>
      </div>
    </div>
  );
}
