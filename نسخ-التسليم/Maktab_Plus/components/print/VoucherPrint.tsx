'use client';

import { Printer } from 'lucide-react';
import { Voucher } from '@/lib/types';
import { formatCurrency, formatDate, getVoucherTypeLabel } from '@/lib/utils';
import useOfficeSettings from '@/lib/useOfficeSettings';

interface VoucherPrintProps {
  voucher: Voucher;
  officeName?: string;
}

export default function VoucherPrint({
  voucher,
  officeName,
}: VoucherPrintProps) {
  const settings = useOfficeSettings();
  const resolvedOfficeName = officeName || settings.officeName;
  const officeAddress = settings.officeAddress;
  const isReceipt = voucher.voucher_type === 'receipt';
  const clientName = voucher.clients?.name ?? '—';

  function handlePrint() {
    const color = isReceipt ? '#15803d' : '#b91c1c';
    const typeLabel = isReceipt ? 'سند قبض' : 'سند صرف';
    const fromLabel = isReceipt ? 'استُلم من' : 'صُرف إلى';
    const dateStr = formatDate(voucher.payment_date);
    const amountFormatted = formatCurrency(Number(voucher.amount));
    const description = voucher.description || (typeLabel + ' رقم ' + voucher.voucher_number);
    const printDate = formatDate(new Date().toISOString());

    const html = [
      '<!DOCTYPE html>',
      '<html dir="rtl" lang="ar">',
      '<head>',
      '<meta charset="UTF-8"/>',
      '<title>' + typeLabel + ' رقم ' + voucher.voucher_number + '</title>',
      '<style>',
      '* { box-sizing: border-box; margin: 0; padding: 0; }',
      'body { font-family: Arial, sans-serif; direction: rtl; padding: 15mm; color: #111; }',
      'h1 { font-size: 22px; font-weight: 700; text-align: center; }',
      '.subtitle { font-size: 12px; color: #555; text-align: center; margin-top: 4px; }',
      '.header { border-bottom: 2px solid #111; padding-bottom: 10px; margin-bottom: 10px; }',
      '.type-badge { display: block; text-align: center; margin: 12px 0; }',
      '.type-badge span { font-size: 16px; font-weight: 700; padding: 4px 32px; border: 2px solid ' + color + '; color: ' + color + '; border-radius: 4px; }',
      'table { width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 13px; }',
      'td { border: 1px solid #555; padding: 8px 12px; }',
      '.lbl { background: #f5f5f5; font-weight: 600; width: 28%; }',
      '.amt-row { border: 2px solid #111 !important; background: #fffde7; }',
      '.amt-row .lbl { font-size: 14px; font-weight: 700; }',
      '.amt-val { font-size: 20px; font-weight: 700; color: ' + color + '; }',
      '.sigs { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-top: 30px; text-align: center; font-size: 13px; }',
      '.sig { border-top: 2px solid #999; padding-top: 8px; }',
      '.footer { margin-top: 20px; text-align: center; font-size: 11px; color: #999; border-top: 1px solid #ddd; padding-top: 8px; }',
      '</style>',
      '</head>',
      '<body>',
      '<div class="header"><h1>' + resolvedOfficeName + '</h1>' + (officeAddress ? '<p class="subtitle">' + officeAddress + '</p>' : '') + '</div>',
      '<div class="type-badge"><span>' + typeLabel + '</span></div>',
      '<table>',
      '<tr><td class="lbl">رقم السند</td><td style="font-weight:700;font-size:16px">' + voucher.voucher_number + '</td><td class="lbl">التاريخ</td><td>' + dateStr + '</td></tr>',
      '<tr><td class="lbl">' + fromLabel + '</td><td colspan="3" style="font-weight:600">' + clientName + '</td></tr>',
      '<tr class="amt-row"><td class="lbl">مبلغ وقدره (رقمًا)</td><td colspan="3" class="amt-val">' + amountFormatted + '</td></tr>',
      '<tr><td class="lbl">مبلغ وقدره (كتابةً)</td><td colspan="3">' + voucher.amount_text + '</td></tr>',
      '<tr><td class="lbl">البيان</td><td colspan="3">' + description + '</td></tr>',
      '</table>',
      '<div class="sigs">',
      '<div class="sig"><p>توقيع المُسلِّم</p><p style="color:#888;margin-top:6px">الاسم: _______________</p></div>',
      '<div class="sig"><p>توقيع المُستلِم</p><p style="color:#888;margin-top:6px">الاسم: _______________</p></div>',
      '</div>',
      '<div class="footer">طُبع بتاريخ: ' + printDate + '</div>',
      '<script>window.onload=function(){window.print();window.onafterprint=function(){window.close();};};</script>',
      '</body></html>',
    ].join('\n');

    const win = window.open('', '_blank', 'width=700,height=900');
    if (win) {
      win.document.write(html);
      win.document.close();
    }
  }

  return (
    <div>
      <div className="flex justify-end mb-4">
        <button onClick={handlePrint} className="btn-secondary flex items-center gap-2">
          <Printer className="w-4 h-4" />
          طباعة السند
        </button>
      </div>

      <div
        className="bg-white border-2 border-gray-800 rounded-lg p-8 max-w-[600px] mx-auto text-gray-900"
        style={{ direction: 'rtl' }}
      >
        <div className="text-center border-b-2 border-gray-800 pb-4 mb-4">
          <h1 className="text-2xl font-bold">{resolvedOfficeName}</h1>
          {officeAddress && <p className="text-sm text-gray-600 mt-1">{officeAddress}</p>}
        </div>

        <div className="text-center mb-6">
          <h2 className={`text-xl font-bold inline-block px-8 py-1 border-2 rounded ${
            isReceipt ? 'border-green-700 text-green-700' : 'border-red-700 text-red-700'
          }`}>
            {getVoucherTypeLabel(voucher.voucher_type)}
          </h2>
        </div>

        <table className="w-full text-sm mb-6 border-collapse">
          <tbody>
            <tr className="border border-gray-300">
              <td className="bg-gray-50 font-semibold px-3 py-2 w-1/3 border-l border-gray-300">رقم السند</td>
              <td className="px-3 py-2 font-bold text-lg">{voucher.voucher_number}</td>
              <td className="bg-gray-50 font-semibold px-3 py-2 w-1/4 border-r border-gray-300">التاريخ</td>
              <td className="px-3 py-2">{formatDate(voucher.payment_date)}</td>
            </tr>
            <tr className="border border-gray-300">
              <td className="bg-gray-50 font-semibold px-3 py-2 border-l border-gray-300">
                {isReceipt ? 'استُلم من' : 'صُرف إلى'}
              </td>
              <td className="px-3 py-2 font-semibold" colSpan={3}>{clientName}</td>
            </tr>
            <tr className="border-2 border-gray-800 bg-yellow-50">
              <td className="font-bold px-3 py-3 border-l-2 border-gray-800">مبلغ وقدره (رقمًا)</td>
              <td className={`px-3 py-3 font-bold text-xl ${isReceipt ? 'text-green-700' : 'text-red-700'}`} colSpan={3}>
                {formatCurrency(voucher.amount)}
              </td>
            </tr>
            <tr className="border border-gray-300">
              <td className="bg-gray-50 font-semibold px-3 py-2 border-l border-gray-300">مبلغ وقدره (كتابةً)</td>
              <td className="px-3 py-2 text-sm" colSpan={3}>{voucher.amount_text}</td>
            </tr>
            <tr className="border border-gray-300">
              <td className="bg-gray-50 font-semibold px-3 py-2 border-l border-gray-300">البيان</td>
              <td className="px-3 py-2 text-sm" colSpan={3}>
                {voucher.description ?? `سند ${isReceipt ? 'قبض' : 'صرف'} رقم ${voucher.voucher_number}`}
              </td>
            </tr>
          </tbody>
        </table>

        <div className="grid grid-cols-2 gap-8 mt-8 text-center text-sm">
          <div className="border-t-2 border-gray-400 pt-3">
            <p className="font-semibold">توقيع المُسلِّم</p>
            <p className="text-gray-500 mt-1">الاسم: _______________</p>
          </div>
          <div className="border-t-2 border-gray-400 pt-3">
            <p className="font-semibold">توقيع المُستلِم</p>
            <p className="text-gray-500 mt-1">الاسم: _______________</p>
          </div>
        </div>

        <div className="mt-6 text-center text-xs text-gray-400 border-t border-gray-200 pt-3">
          <p>طُبع بتاريخ: {formatDate(new Date().toISOString())}</p>
        </div>
      </div>
    </div>
  );
}
