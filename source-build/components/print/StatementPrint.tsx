'use client';

import { Eye, Printer } from 'lucide-react';
import { Client, StatementEntry, StatementFilter } from '@/lib/types';
import { formatCurrency, formatDate, formatDateShort, toEnglishDigits } from '@/lib/utils';
import { tafqeet } from '@/lib/tafqeet';
import useOfficeSettings from '@/lib/useOfficeSettings';

interface StatementPrintProps {
  client: Client;
  entries: StatementEntry[];
  dateFrom?: string;
  dateTo?: string;
  officeName?: string;
  filter?: StatementFilter;
}

const ROWS_PER_PAGE = 8;

export default function StatementPrint({
  client,
  entries,
  dateFrom,
  dateTo,
  officeName,
  filter = 'all',
}: StatementPrintProps) {
  const settings = useOfficeSettings();
  const resolvedOfficeName = officeName || settings.officeName;
  const openingBalance = client.type === 'creditor'
    ? -Math.abs(client.opening_balance)
    : Math.abs(client.opening_balance);
  const totalDebit = entries.reduce((sum, entry) => sum + entry.debit, 0);
  const totalCredit = entries.reduce((sum, entry) => sum + entry.credit, 0);
  const finalBalance = entries.length ? entries[entries.length - 1].balance : openingBalance;
  const isOfficeStatement = client.id === 'office-account';
  const statementType = filter === 'debit'
    ? 'كشف الحركات المدينة على العميل'
    : filter === 'credit'
      ? 'كشف الحركات الدائنة للعميل'
      : 'كشف جميع حركات العميل';
  const balanceStatement = finalBalance > 0
    ? (isOfficeStatement ? 'صافي الرصيد مستحق للمكتب' : 'الرصيد مدين على العميل ومستحق للمكتب')
    : finalBalance < 0
      ? (isOfficeStatement ? 'صافي الرصيد مستحق على المكتب' : 'الرصيد دائن للعميل ومستحق على المكتب')
      : 'الحساب مسدد ولا يوجد رصيد مستحق';
  const pages: StatementEntry[][] = [];

  if (entries.length === 0) {
    pages.push([]);
  } else {
    for (let index = 0; index < entries.length; index += ROWS_PER_PAGE) {
      pages.push(entries.slice(index, index + ROWS_PER_PAGE));
    }
  }

  return (
    <div>
      <div className="report-preview-toolbar flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <p className="font-bold text-gray-900 flex items-center gap-2">
            <Eye className="w-4 h-4 text-indigo-600" />
            معاينة التقرير
          </p>
          <p className="text-xs text-gray-500 mt-1">
            عدد الصفحات: {toEnglishDigits(pages.length)} - راجع جميع الصفحات ثم اطبع عند الحاجة
          </p>
        </div>
        <button onClick={() => window.print()} className="btn-primary flex items-center gap-2">
          <Printer className="w-4 h-4" />
          طباعة التقرير
        </button>
      </div>

      <div className="report-preview-shell bg-gray-200 rounded-xl border border-gray-300 p-4 max-h-[78vh] overflow-y-auto">
        <div className="statement-preview space-y-5">
          {pages.map((pageEntries, pageIndex) => {
            const rowStart = pageIndex * ROWS_PER_PAGE;
            const isFirstPage = pageIndex === 0;
            const isLastPage = pageIndex === pages.length - 1;

            return (
              <section
                key={pageIndex}
                className="statement-page bg-white mx-auto shadow-md p-8"
                style={{ direction: 'rtl' }}
              >
                <header className="border-b-2 border-gray-900 pb-3 mb-4 text-center">
                  <h1 className="text-2xl font-bold">{resolvedOfficeName}</h1>
                  {settings.officeAddress && <p className="text-xs text-gray-500 mt-1">{settings.officeAddress}</p>}
                  <h2 className="text-lg font-bold mt-2">كشف حساب</h2>
                  <p className="font-semibold mt-1">
                    العميل: <span className="text-indigo-800">{client.name}</span>
                    {client.phone && <span className="text-gray-500 text-xs mr-3" dir="ltr">({toEnglishDigits(client.phone)})</span>}
                  </p>
                  {(dateFrom || dateTo) && (
                    <p className="text-xs text-gray-500 mt-1">
                      الفترة: {dateFrom ? formatDate(dateFrom) : '-'} إلى {dateTo ? formatDate(dateTo) : '-'}
                    </p>
                  )}
                  <p className="text-xs text-gray-500 mt-1">{statementType}</p>
                </header>

                <table className="statement-table w-full text-[11px] border-collapse table-fixed">
                  <colgroup>
                    <col style={{ width: '5%' }} />
                    <col style={{ width: '12%' }} />
                    <col style={{ width: '12%' }} />
                    <col style={{ width: '35%' }} />
                    <col style={{ width: '12%' }} />
                    <col style={{ width: '12%' }} />
                    <col style={{ width: '12%' }} />
                  </colgroup>
                  <thead>
                    <tr className="bg-gray-800 text-white">
                      <th className="border border-gray-600 px-2 py-2 text-center">#</th>
                      <th className="border border-gray-600 px-2 py-2 text-center">التاريخ</th>
                      <th className="border border-gray-600 px-2 py-2 text-center">رقم السند/العملية</th>
                      <th className="border border-gray-600 px-2 py-2 text-right">البيان</th>
                      <th className="border border-gray-600 px-2 py-2 text-left">مدين</th>
                      <th className="border border-gray-600 px-2 py-2 text-left">دائن</th>
                      <th className="border border-gray-600 px-2 py-2 text-left">الرصيد</th>
                    </tr>
                  </thead>
                  <tbody>
                    {isFirstPage && openingBalance !== 0 && (
                      <tr className="bg-amber-50">
                        <td className="border border-gray-300 px-2 py-2 text-center">0</td>
                        <td className="border border-gray-300 px-2 py-2 text-center">-</td>
                        <td className="border border-gray-300 px-2 py-2 text-center">-</td>
                        <td className="border border-gray-300 px-2 py-2 font-semibold">
                          {isOfficeStatement ? 'صافي الأرصدة الافتتاحية' : 'رصيد افتتاحي'}
                        </td>
                        <td className="border border-gray-300 px-2 py-2 text-left">{openingBalance > 0 ? formatCurrency(openingBalance) : '-'}</td>
                        <td className="border border-gray-300 px-2 py-2 text-left">{openingBalance < 0 ? formatCurrency(-openingBalance) : '-'}</td>
                        <td className="border border-gray-300 px-2 py-2 text-left font-bold">{formatCurrency(Math.abs(openingBalance))}</td>
                      </tr>
                    )}
                    {pageEntries.map((entry, index) => (
                      <tr key={`${entry.date}-${rowStart + index}`} className={index % 2 ? 'bg-gray-50' : 'bg-white'}>
                        <td className="border border-gray-300 px-2 py-2 text-center">{toEnglishDigits(rowStart + index + 1)}</td>
                        <td className="border border-gray-300 px-2 py-2 text-center" dir="ltr">{formatDateShort(entry.date)}</td>
                        <td className="border border-gray-300 px-2 py-2 text-center">
                          {toEnglishDigits(entry.voucherNumber ?? entry.operationNumber ?? '-')}
                        </td>
                        <td className="statement-description border border-gray-300 px-2 py-2 text-[12px] leading-6 whitespace-pre-wrap break-words">
                          {entry.description}
                        </td>
                        <td className="border border-gray-300 px-2 py-2 text-left text-green-800 font-semibold">
                          {entry.debit ? formatCurrency(entry.debit) : '-'}
                        </td>
                        <td className="border border-gray-300 px-2 py-2 text-left text-purple-800 font-semibold">
                          {entry.credit ? formatCurrency(entry.credit) : '-'}
                        </td>
                        <td className="border border-gray-300 px-2 py-2 text-left font-bold">
                          {formatCurrency(Math.abs(entry.balance))} {entry.balance >= 0 ? 'مدين' : 'دائن'}
                        </td>
                      </tr>
                    ))}
                    {pageEntries.length === 0 && openingBalance === 0 && (
                      <tr>
                        <td colSpan={7} className="border border-gray-300 px-3 py-12 text-center text-gray-400">
                          لا توجد حركات في الفترة المحددة
                        </td>
                      </tr>
                    )}
                  </tbody>
                  {isLastPage && (
                    <tfoot>
                      <tr className="bg-gray-900 text-white font-bold">
                        <td colSpan={4} className="border border-gray-700 px-2 py-2 text-center">الإجماليات</td>
                        <td className="border border-gray-700 px-2 py-2 text-left">{formatCurrency(totalDebit)}</td>
                        <td className="border border-gray-700 px-2 py-2 text-left">{formatCurrency(totalCredit)}</td>
                        <td className="border border-gray-700 px-2 py-2 text-left">{formatCurrency(Math.abs(finalBalance))}</td>
                      </tr>
                    </tfoot>
                  )}
                </table>

                {isLastPage && (
                  <>
                    <div className="mt-5 rounded-lg border-2 border-red-900 bg-red-50 px-5 py-4 text-center">
                      <p className="text-sm font-bold text-gray-700">الرصيد الختامي</p>
                      <p className="text-3xl font-black text-red-900 mt-1">
                        {formatCurrency(Math.abs(finalBalance))}
                      </p>
                      <p className="text-xl font-extrabold text-red-900 mt-1">
                        {finalBalance > 0
                          ? (isOfficeStatement ? 'مستحق للمكتب' : 'مدين على العميل')
                          : finalBalance < 0
                            ? (isOfficeStatement ? 'مستحق على المكتب' : 'دائن للعميل')
                            : 'الحساب مسدد'}
                      </p>
                      <p className="text-sm font-bold text-red-900 mt-2">{balanceStatement}</p>
                      <p className="text-xs text-gray-600 mt-2">الرصيد كتابةً: {tafqeet(Math.abs(finalBalance))}</p>
                    </div>

                    <div className="mt-10 grid grid-cols-2 gap-12 text-center text-sm">
                      <div className="border-t-2 border-gray-500 pt-2">المسؤول المالي</div>
                      <div className="border-t-2 border-gray-500 pt-2">المدير العام</div>
                    </div>
                  </>
                )}

                <footer className="mt-auto pt-4 text-center text-[10px] text-gray-400">
                  صفحة {toEnglishDigits(pageIndex + 1)} من {toEnglishDigits(pages.length)}
                  {' | '}
                  طبع بتاريخ {formatDateShort(new Date().toISOString())}
                </footer>
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}
