'use client';

import { Printer } from 'lucide-react';
import useOfficeSettings from '@/lib/useOfficeSettings';
import { formatCurrency, formatDateShort } from '@/lib/utils';

interface InvoiceItem {
  id: string;
  description: string;
  quantity: number;
  unit_price: number;
  line_total: number;
}

interface Invoice {
  invoice_number: number;
  invoice_date: string;
  customer_name?: string | null;
  total_amount: number;
  amount_text: string;
  created_by_name?: string;
  items: InvoiceItem[];
}

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export default function InvoicePrint({ invoice }: { invoice: Invoice }) {
  const settings = useOfficeSettings();

  function handlePrint() {
    const itemRows = invoice.items.map((item, index) => `
      <tr>
        <td class="center">${index + 1}</td>
        <td>${escapeHtml(item.description)}</td>
        <td class="center">${escapeHtml(item.quantity)}</td>
        <td class="center">${escapeHtml(formatCurrency(item.unit_price))}</td>
        <td class="center total-cell">${escapeHtml(formatCurrency(item.line_total))}</td>
      </tr>
    `).join('');

    const html = `
      <!doctype html>
      <html lang="ar" dir="rtl">
        <head>
          <meta charset="utf-8" />
          <title>فاتورة مبيعات رقم ${invoice.invoice_number}</title>
          <style>
            @page { size: A4; margin: 14mm; }
            * { box-sizing: border-box; }
            html, body { margin: 0; padding: 0; background: #fff; }
            body {
              direction: rtl;
              color: #111827;
              font-family: Arial, Tahoma, sans-serif;
              font-size: 13px;
            }
            .invoice-sheet {
              width: 100%;
              min-height: 255mm;
              border: 2px solid #1f2937;
              padding: 12mm;
            }
            .header {
              text-align: center;
              border-bottom: 2px solid #1f2937;
              padding-bottom: 12px;
              margin-bottom: 18px;
            }
            h1 { margin: 0; font-size: 24px; }
            .address { margin: 5px 0 0; color: #4b5563; font-size: 12px; }
            h2 { margin: 14px 0 0; font-size: 20px; }
            .meta {
              display: grid;
              grid-template-columns: 1fr 1fr;
              gap: 10px 24px;
              margin-bottom: 18px;
            }
            .meta-item {
              border: 1px solid #9ca3af;
              padding: 9px 12px;
            }
            .customer { grid-column: 1 / -1; }
            .label { font-weight: 700; }
            table { width: 100%; border-collapse: collapse; margin-bottom: 18px; }
            th, td { border: 1px solid #4b5563; padding: 8px; }
            th { background: #f3f4f6; font-weight: 700; }
            .center { text-align: center; }
            .total-cell { font-weight: 700; }
            .summary { border: 2px solid #1f2937; }
            .summary-total {
              display: flex;
              justify-content: space-between;
              gap: 20px;
              padding: 12px;
              background: #f3f4f6;
              font-size: 18px;
              font-weight: 700;
            }
            .amount-text {
              border-top: 1px solid #1f2937;
              padding: 12px;
              line-height: 1.8;
            }
            .footer {
              display: flex;
              justify-content: space-between;
              gap: 20px;
              margin-top: 40px;
              border-top: 1px solid #d1d5db;
              padding-top: 12px;
              color: #4b5563;
              font-size: 11px;
            }
          </style>
        </head>
        <body>
          <main class="invoice-sheet">
            <div class="header">
              <h1>${escapeHtml(settings.officeName)}</h1>
              ${settings.officeAddress ? `<p class="address">${escapeHtml(settings.officeAddress)}</p>` : ''}
              <h2>فاتورة مبيعات</h2>
            </div>
            <div class="meta">
              <div class="meta-item"><span class="label">رقم الفاتورة:</span> ${invoice.invoice_number}</div>
              <div class="meta-item"><span class="label">التاريخ:</span> ${escapeHtml(formatDateShort(invoice.invoice_date))}</div>
              <div class="meta-item customer"><span class="label">اسم العميل:</span> ${escapeHtml(invoice.customer_name || 'عميل نقدي')}</div>
            </div>
            <table>
              <thead>
                <tr>
                  <th style="width:7%">م</th>
                  <th>البيان / الخدمة</th>
                  <th style="width:12%">الكمية</th>
                  <th style="width:18%">السعر</th>
                  <th style="width:20%">الإجمالي</th>
                </tr>
              </thead>
              <tbody>${itemRows}</tbody>
            </table>
            <div class="summary">
              <div class="summary-total">
                <span>المبلغ الإجمالي</span>
                <span>${escapeHtml(formatCurrency(invoice.total_amount))}</span>
              </div>
              <div class="amount-text"><span class="label">فقط:</span> ${escapeHtml(invoice.amount_text)}</div>
            </div>
            <div class="footer">
              <span>أصدرها: ${escapeHtml(invoice.created_by_name || 'النظام')}</span>
              <span>شكرًا لتعاملكم معنا</span>
            </div>
          </main>
          <script>
            window.onload = function () {
              window.print();
              window.onafterprint = function () { window.close(); };
            };
          </script>
        </body>
      </html>
    `;

    const printWindow = window.open('', '_blank', 'width=900,height=900');
    if (!printWindow) {
      alert('تعذر فتح نافذة الطباعة. تأكد من السماح بالنوافذ المنبثقة.');
      return;
    }
    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
  }

  return (
    <div>
      <div className="flex justify-end mb-4">
        <button onClick={handlePrint} className="btn-primary flex items-center gap-2">
          <Printer className="w-4 h-4" /> طباعة الفاتورة
        </button>
      </div>
      <section className="bg-white border border-gray-200 rounded-xl p-7 text-gray-900">
        <div className="text-center border-b-2 border-gray-800 pb-4 mb-5">
          <h1 className="text-2xl font-bold">{settings.officeName}</h1>
          {settings.officeAddress && <p className="text-sm text-gray-500 mt-1">{settings.officeAddress}</p>}
          <h2 className="text-xl font-bold mt-4">فاتورة مبيعات</h2>
        </div>
        <div className="grid grid-cols-2 gap-4 mb-5 text-sm">
          <p><span className="font-bold">رقم الفاتورة:</span> {invoice.invoice_number}</p>
          <p><span className="font-bold">التاريخ:</span> {formatDateShort(invoice.invoice_date)}</p>
          <p className="col-span-2"><span className="font-bold">اسم العميل:</span> {invoice.customer_name || 'عميل نقدي'}</p>
        </div>
        <table className="w-full border-collapse text-sm mb-5">
          <thead className="bg-gray-100">
            <tr>
              <th className="border border-gray-500 p-2 w-12">م</th>
              <th className="border border-gray-500 p-2 text-right">البيان / الخدمة</th>
              <th className="border border-gray-500 p-2">الكمية</th>
              <th className="border border-gray-500 p-2">السعر</th>
              <th className="border border-gray-500 p-2">الإجمالي</th>
            </tr>
          </thead>
          <tbody>
            {invoice.items.map((item, index) => (
              <tr key={item.id || index}>
                <td className="border border-gray-400 p-2 text-center">{index + 1}</td>
                <td className="border border-gray-400 p-2">{item.description}</td>
                <td className="border border-gray-400 p-2 text-center">{item.quantity}</td>
                <td className="border border-gray-400 p-2 text-center">{formatCurrency(item.unit_price)}</td>
                <td className="border border-gray-400 p-2 text-center font-bold">{formatCurrency(item.line_total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="border-2 border-gray-800 rounded-lg overflow-hidden">
          <div className="flex justify-between p-3 bg-gray-100 font-bold text-lg">
            <span>المبلغ الإجمالي</span><span>{formatCurrency(invoice.total_amount)}</span>
          </div>
          <div className="p-3 border-t border-gray-800 text-sm"><span className="font-bold">فقط:</span> {invoice.amount_text}</div>
        </div>
        <div className="mt-10 pt-4 border-t text-xs text-gray-500 flex justify-between">
          <span>أصدرها: {invoice.created_by_name || 'النظام'}</span>
          <span>شكرًا لتعاملكم معنا</span>
        </div>
      </section>
    </div>
  );
}
