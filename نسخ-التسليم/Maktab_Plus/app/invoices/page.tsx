'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Edit2, FilePlus2, Plus, Printer, Search, Trash2, X } from 'lucide-react';
import MainLayout from '@/components/layout/MainLayout';
import Modal from '@/components/ui/Modal';
import InvoicePrint, {
  type InvoicePrintData,
  writeInvoiceToPrintWindow,
} from '@/components/print/InvoicePrint';
import { useAuth } from '@/components/auth/AuthProvider';
import { formatCurrency, formatDateShort } from '@/lib/utils';
import { tafqeet } from '@/lib/tafqeet';
import useOfficeSettings from '@/lib/useOfficeSettings';

interface Service { id: string; name: string }
interface ReportUser { id: string; arabic_name: string; username: string }
interface Item {
  id?: string;
  service_id: string;
  description: string;
  quantity: number;
  unit_price: number;
  line_total?: number;
}
interface Invoice {
  id: string;
  invoice_number: number;
  invoice_date: string;
  customer_name?: string | null;
  total_amount: number;
  amount_text: string;
  created_by?: string | null;
  created_by_name?: string;
  created_by_username?: string;
  updated_by_name?: string;
  items?: Item[];
}

const today = () => new Date().toLocaleDateString('en-CA');
const emptyItem = (): Item => ({ service_id: '', description: '', quantity: 1, unit_price: 0 });

export default function InvoicesPage() {
  const { can, user } = useAuth();
  const { officeName, officeAddress } = useOfficeSettings();
  const [tab, setTab] = useState<'form' | 'list' | 'reports'>('form');
  const [services, setServices] = useState<Service[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [invoiceDate, setInvoiceDate] = useState(today());
  const [customerName, setCustomerName] = useState('');
  const [items, setItems] = useState<Item[]>([emptyItem()]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [serviceName, setServiceName] = useState('');
  const [showService, setShowService] = useState(false);
  const [printInvoice, setPrintInvoice] = useState<Invoice | null>(null);
  const [reportMode, setReportMode] = useState<'all' | 'daily' | 'monthly' | 'range'>('daily');
  const [reportDate, setReportDate] = useState(today());
  const [reportMonth, setReportMonth] = useState(today().slice(0, 7));
  const [dateFrom, setDateFrom] = useState(today());
  const [dateTo, setDateTo] = useState(today());
  const [search, setSearch] = useState('');
  const [userFilter, setUserFilter] = useState('');
  const [invoiceLookup, setInvoiceLookup] = useState('');
  const [invoiceLookupResults, setInvoiceLookupResults] = useState<Invoice[]>([]);
  const [invoiceLookupOpen, setInvoiceLookupOpen] = useState(false);
  const [invoiceLookupLoading, setInvoiceLookupLoading] = useState(false);
  const [reportUsers, setReportUsers] = useState<ReportUser[]>([]);
  const [reportUserId, setReportUserId] = useState('');

  const loadServices = useCallback(async () => {
    const response = await fetch('/api/services');
    if (response.ok) setServices(await response.json());
  }, []);
  const loadInvoices = useCallback(async (query = '') => {
    const response = await fetch(`/api/invoices${query}`);
    if (response.ok) setInvoices(await response.json());
  }, []);
  const loadReportUsers = useCallback(async () => {
    const response = await fetch('/api/invoices/creators');
    if (!response.ok) return;
    const data = await response.json() as ReportUser[];
    setReportUsers(data);
    if (
      user?.role === 'user'
      && user?.permission_mode === 'custom'
      && user.permissions.includes('scope.own_only')
    ) {
      setReportUserId(user.id);
    }
  }, [user]);
  useEffect(() => { loadServices(); loadInvoices(); }, [loadServices, loadInvoices]);
  useEffect(() => {
    if (can('invoices.reports')) void loadReportUsers();
  }, [can, loadReportUsers]);

  const total = useMemo(() => items.reduce((sum, item) =>
    sum + (Number(item.quantity) || 0) * (Number(item.unit_price) || 0), 0), [items]);
  const hasUnsavedNewInvoice = !editingId && (
    customerName.trim().length > 0
    || items.some((item) =>
      item.description.trim().length > 0
      || Number(item.unit_price) !== 0
      || Number(item.quantity) !== 1
    )
  );

  function updateItem(index: number, patch: Partial<Item>) {
    setItems((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item));
  }
  function chooseService(index: number, name: string) {
    const service = services.find((item) => item.name === name);
    updateItem(index, { description: name, service_id: service?.id || '' });
  }
  function resetForm() {
    setEditingId(null); setInvoiceDate(today()); setCustomerName(''); setItems([emptyItem()]); setError('');
  }

  async function searchInvoices(value: string) {
    if (hasUnsavedNewInvoice) {
      setError('احفظ الفاتورة الحالية أولًا قبل البحث عن فاتورة أخرى حتى لا تضيع البيانات المدخلة.');
      setInvoiceLookupOpen(false);
      return;
    }

    setInvoiceLookup(value);
    setError('');
    const query = value.trim();
    if (!query) {
      setInvoiceLookupResults([]);
      setInvoiceLookupOpen(false);
      return;
    }

    setInvoiceLookupLoading(true);
    try {
      const response = await fetch(`/api/invoices?search=${encodeURIComponent(query)}`);
      if (!response.ok) {
        setError('تعذر البحث عن الفواتير');
        return;
      }
      const results = await response.json() as Invoice[];
      setInvoiceLookupResults(results);
      setInvoiceLookupOpen(true);
    } finally {
      setInvoiceLookupLoading(false);
    }
  }

  async function selectLookupInvoice(invoice: Invoice) {
    setInvoiceLookupOpen(false);
    setInvoiceLookup(`#${invoice.invoice_number} - ${invoice.customer_name || 'عميل نقدي'}`);
    await openInvoice(invoice, 'edit');
  }

  async function saveInvoice(printAfterSave = false) {
    setError(''); setMessage('');
    if (!items.some((item) => item.description.trim())) return setError('أضف بندًا واحدًا على الأقل');

    const printWindow = printAfterSave ? window.open('', '_blank', 'width=900,height=900') : null;
    if (printAfterSave && !printWindow) {
      return setError('تعذر فتح نافذة الطباعة. اسمح بالنوافذ المنبثقة لهذا الموقع ثم حاول مجددًا.');
    }

    if (printWindow) {
      printWindow.document.write('<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>جارٍ تجهيز الفاتورة</title></head><body style="font-family:Arial;text-align:center;padding:60px"><h2>جارٍ حفظ وتجهيز الفاتورة للطباعة...</h2></body></html>');
      printWindow.document.close();
    }

    setSaving(true);
    try {
      const response = await fetch(editingId ? `/api/invoices/${editingId}` : '/api/invoices', {
        method: editingId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoice_date: invoiceDate, customer_name: customerName, items }),
      });
      const data = await response.json();
      if (!response.ok) {
        printWindow?.close();
        return setError(data.error || 'تعذر حفظ الفاتورة');
      }

      setMessage(editingId ? 'تم تحديث الفاتورة بنجاح' : `تم حفظ الفاتورة رقم ${data.invoice_number}`);
      const savedId = editingId || data.id;

      if (printWindow && savedId) {
        const fullResponse = await fetch(`/api/invoices/${savedId}`);
        if (!fullResponse.ok) {
          printWindow.close();
          return setError('تم حفظ الفاتورة، لكن تعذر تحميلها للطباعة.');
        }
        const fullInvoice = await fullResponse.json() as InvoicePrintData;
        writeInvoiceToPrintWindow(printWindow, fullInvoice, { officeName, officeAddress });
      }

      resetForm();
      await loadInvoices();
    } catch {
      printWindow?.close();
      setError('تعذر الاتصال بالخادم لحفظ الفاتورة');
    } finally {
      setSaving(false);
    }
  }

  async function openInvoice(invoice: Invoice, mode: 'edit' | 'print') {
    const response = await fetch(`/api/invoices/${invoice.id}`);
    if (!response.ok) return;
    const full = await response.json();
    if (mode === 'print') return setPrintInvoice(full);
    setEditingId(full.id); setInvoiceDate(full.invoice_date.split('T')[0]); setCustomerName(full.customer_name || '');
    setItems(full.items); setTab('form'); setMessage('');
  }

  async function deleteInvoice(invoice: Invoice) {
    if (!confirm(`هل تريد حذف الفاتورة رقم ${invoice.invoice_number} نهائيًا؟`)) return;
    const response = await fetch(`/api/invoices/${invoice.id}`, { method: 'DELETE' });
    const data = await response.json();
    if (!response.ok) return alert(data.error || 'تعذر الحذف');
    await loadInvoices();
  }

  async function addService() {
    const response = await fetch('/api/services', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: serviceName }),
    });
    const data = await response.json();
    if (!response.ok) return setError(data.error || 'تعذر إضافة الخدمة');
    setServiceName(''); setShowService(false); await loadServices();
  }

  async function generateReport() {
    const query = new URLSearchParams();
    if (reportMode === 'daily') {
      query.set('from', reportDate);
      query.set('to', reportDate);
    } else if (reportMode === 'monthly') {
      query.set('month', reportMonth);
    } else if (reportMode === 'range') {
      query.set('from', dateFrom);
      query.set('to', dateTo);
    }
    if (reportUserId) query.set('user_id', reportUserId);
    await loadInvoices(`?${query.toString()}`);
  }

  const normalizedSearch = search.trim().toLowerCase();
  const invoiceUsers = Array.from(new Set(
    invoices.map((invoice) => invoice.created_by_name).filter((name): name is string => Boolean(name))
  )).sort((first, second) => first.localeCompare(second, 'ar'));
  const shownInvoices = invoices.filter((invoice) => {
    const matchesSearch =
      !normalizedSearch ||
      String(invoice.invoice_number).includes(normalizedSearch) ||
      (invoice.customer_name || '').toLowerCase().includes(normalizedSearch) ||
      (invoice.created_by_name || '').toLowerCase().includes(normalizedSearch);
    const matchesUser = !userFilter || invoice.created_by_name === userFilter;
    return matchesSearch && matchesUser;
  });
  const reportTotal = invoices.reduce((sum, invoice) => sum + invoice.total_amount, 0);
  const selectedReportUser = reportUsers.find((item) => item.id === reportUserId);
  const reportUserName = selectedReportUser
    ? `${selectedReportUser.arabic_name} (@${selectedReportUser.username})`
    : 'جميع المستخدمين';
  const reportPeriod = reportMode === 'all'
    ? 'جميع الفواتير'
    : reportMode === 'daily'
    ? `تقرير يوم ${formatDateShort(reportDate)}`
    : reportMode === 'monthly'
      ? `تقرير شهر ${reportMonth}`
      : `من ${formatDateShort(dateFrom)} إلى ${formatDateShort(dateTo)}`;

  return (
    <MainLayout title="الفواتير" subtitle="إنشاء الفواتير واستعراضها وتقاريرها" permission="invoices.view">
      <div className="flex flex-wrap gap-2 mb-6 print-hidden">
        {[
          ['form', editingId ? 'تعديل الفاتورة' : 'فاتورة جديدة'],
          ['list', 'قائمة الفواتير'],
          ['reports', 'تقارير الفواتير'],
        ].map(([value, label]) => (
          <button key={value} onClick={() => { setTab(value as typeof tab); if (value === 'list') loadInvoices(); }}
            className={tab === value ? 'btn-primary' : 'btn-secondary'}>{label}</button>
        ))}
      </div>

      {tab === 'form' && (
        <div className="space-y-5">
          {!can(editingId ? 'invoices.edit' : 'invoices.create') ? (
            <div className="card p-8 text-center text-gray-500">لا تملك صلاحية إنشاء أو تعديل الفواتير.</div>
          ) : (
            <>
              {(error || message) && <div className={`rounded-xl border px-4 py-3 text-sm ${error ? 'bg-red-50 border-red-200 text-red-700' : 'bg-green-50 border-green-200 text-green-700'}`}>{error || message}</div>}
              <div className="card p-6">
                <div className="relative mb-6 max-w-2xl">
                  <label htmlFor="invoice-lookup" className="block text-sm font-semibold mb-2">
                    البحث عن فاتورة محفوظة
                  </label>
                  <div className="relative">
                    <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                      id="invoice-lookup"
                      className="input-field pr-11"
                      value={invoiceLookup}
                      onChange={(event) => void searchInvoices(event.target.value)}
                      onFocus={() => {
                        if (hasUnsavedNewInvoice) {
                          setError('احفظ الفاتورة الحالية أولًا قبل البحث عن فاتورة أخرى حتى لا تضيع البيانات المدخلة.');
                        } else if (invoiceLookupResults.length) {
                          setInvoiceLookupOpen(true);
                        }
                      }}
                      placeholder="ابحث برقم الفاتورة أو اسم العميل..."
                      autoComplete="off"
                    />
                    {invoiceLookupLoading && (
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">جارٍ البحث...</span>
                    )}
                  </div>
                  {invoiceLookupOpen && (
                    <div className="absolute z-30 mt-2 w-full overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl">
                      {invoiceLookupResults.length ? invoiceLookupResults.map((invoice) => (
                        <button
                          key={invoice.id}
                          type="button"
                          onClick={() => void selectLookupInvoice(invoice)}
                          className="flex w-full items-center justify-between gap-4 border-b border-gray-100 px-4 py-3 text-right last:border-0 hover:bg-indigo-50"
                        >
                          <span>
                            <span className="block font-bold">فاتورة رقم {invoice.invoice_number}</span>
                            <span className="block text-sm text-gray-500">{invoice.customer_name || 'عميل نقدي'}</span>
                          </span>
                          <span className="text-sm text-gray-500">{formatDateShort(invoice.invoice_date)}</span>
                        </button>
                      )) : (
                        <p className="px-4 py-5 text-center text-sm text-gray-500">لا توجد فاتورة مطابقة</p>
                      )}
                    </div>
                  )}
                </div>
                <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
                  <div>
                    <h2 className="text-xl font-bold">{editingId ? 'تعديل فاتورة مبيعات' : 'فاتورة مبيعات جديدة'}</h2>
                    <p className="text-sm text-gray-500 mt-1">اسم العميل اختياري، وتُعرض جميع المبالغ بالأرقام فقط</p>
                  </div>
                  {editingId && <button onClick={resetForm} className="btn-secondary flex items-center gap-1"><X className="w-4 h-4" /> إلغاء التعديل</button>}
                </div>
                <div className="grid md:grid-cols-2 gap-4 mb-6">
                  <label><span className="block text-sm font-semibold mb-2">تاريخ الفاتورة</span><input type="date" className="input-field" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} /></label>
                  <label><span className="block text-sm font-semibold mb-2">اسم العميل (اختياري)</span><input className="input-field" value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="اتركه فارغًا للعميل النقدي" /></label>
                </div>

                <div className="overflow-x-auto border rounded-xl">
                  <table className="w-full min-w-[800px] text-sm">
                    <thead className="bg-gray-100">
                      <tr><th className="p-3 w-12">م</th><th className="p-3 text-right">البيان / الخدمة</th><th className="p-3 w-28">الكمية</th><th className="p-3 w-40">السعر</th><th className="p-3 w-40">الإجمالي</th><th className="p-3 w-16"></th></tr>
                    </thead>
                    <tbody>
                      {items.map((item, index) => (
                        <tr key={index} className="border-t">
                          <td className="p-2 text-center">{index + 1}</td>
                          <td className="p-2">
                            <input list="services-list" className="input-field" value={item.description} onChange={(e) => chooseService(index, e.target.value)} placeholder="ابحث أو اختر خدمة..." />
                          </td>
                          <td className="p-2">
                            <input
                              type="number"
                              min="0.01"
                              step="0.01"
                              inputMode="decimal"
                              className="input-field number-input-manual text-center"
                              value={item.quantity}
                              onWheel={(event) => event.currentTarget.blur()}
                              onKeyDown={(event) => {
                                if (event.key === 'ArrowUp' || event.key === 'ArrowDown') event.preventDefault();
                              }}
                              onChange={(event) => updateItem(index, { quantity: Number(event.target.value) })}
                            />
                          </td>
                          <td className="p-2">
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              inputMode="decimal"
                              className="input-field number-input-manual text-center"
                              value={item.unit_price || ''}
                              onWheel={(event) => event.currentTarget.blur()}
                              onKeyDown={(event) => {
                                if (event.key === 'ArrowUp' || event.key === 'ArrowDown') event.preventDefault();
                              }}
                              onChange={(event) => updateItem(index, { unit_price: Number(event.target.value) })}
                            />
                          </td>
                          <td className="p-2 text-center font-bold">{formatCurrency(item.quantity * item.unit_price)}</td>
                          <td className="p-2 text-center">
                            <div className="flex items-center justify-center gap-1">
                              <button
                                type="button"
                                onClick={() => setItems((current) => {
                                  const next = [...current];
                                  next.splice(index + 1, 0, emptyItem());
                                  return next;
                                })}
                                className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg"
                                title="إضافة بند جديد"
                              >
                                <Plus className="w-4 h-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setItems((current) =>
                                  current.length === 1
                                    ? [emptyItem()]
                                    : current.filter((_, i) => i !== index)
                                )}
                                className="text-red-500 hover:bg-red-50 rounded-lg p-2"
                                title="حذف البند"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <datalist id="services-list">{services.map((service) => <option key={service.id} value={service.name} />)}</datalist>
                </div>
                <div className="flex flex-wrap gap-2 mt-4">
                  {can('services.manage') && <button onClick={() => setShowService(true)} className="btn-secondary flex items-center gap-1"><FilePlus2 className="w-4 h-4" /> إضافة خدمة للقائمة</button>}
                </div>
                <div className="mt-6 mr-auto max-w-xl rounded-xl border-2 border-indigo-200 bg-indigo-50 overflow-hidden">
                  <div className="flex justify-between p-4 text-xl font-bold text-indigo-950"><span>الإجمالي</span><span>{formatCurrency(total)}</span></div>
                  <div className="border-t border-indigo-200 p-4 text-sm text-indigo-900">{tafqeet(total)}</div>
                </div>
                <div className="mt-6 flex flex-wrap gap-3">
                  <button onClick={() => saveInvoice(false)} disabled={saving} className="btn-primary px-8 py-3">
                    {saving ? 'جارٍ الحفظ...' : editingId ? 'حفظ التعديلات' : 'حفظ الفاتورة'}
                  </button>
                  {can('invoices.print') && (
                    <button
                      onClick={() => saveInvoice(true)}
                      disabled={saving}
                      className="btn-secondary px-8 py-3 flex items-center gap-2"
                    >
                      <Printer className="w-4 h-4" />
                      حفظ وطباعة الفاتورة
                    </button>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {tab === 'list' && (
        <div className="card">
          <div className="p-5 border-b flex flex-wrap gap-3 items-center justify-between">
            <h2 className="font-bold">جميع الفواتير</h2>
            <div className="flex flex-wrap gap-3 w-full sm:w-auto">
              <label className="relative w-full sm:w-80">
                <Search className="absolute right-3 top-3 w-4 h-4 text-gray-400" />
                <input
                  className="input-field pr-9"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="رقم الفاتورة أو العميل أو اسم المستخدم"
                />
              </label>
              <select
                className="input-field w-full sm:w-56"
                value={userFilter}
                onChange={(event) => setUserFilter(event.target.value)}
                aria-label="فلترة الفواتير حسب المستخدم"
              >
                <option value="">جميع المستخدمين</option>
                {invoiceUsers.map((userName) => (
                  <option key={userName} value={userName}>{userName}</option>
                ))}
              </select>
            </div>
          </div>
          <InvoiceTable invoices={shownInvoices} can={can} onEdit={(i) => openInvoice(i, 'edit')} onPrint={(i) => openInvoice(i, 'print')} onDelete={deleteInvoice} />
        </div>
      )}

      {tab === 'reports' && (
        <div className="space-y-5">
          {!can('invoices.reports') ? <div className="card p-8 text-center">لا تملك صلاحية تقارير الفواتير.</div> : <>
            <div className="card p-5 print-hidden">
              <div className="flex flex-wrap gap-2 mb-4">
                {([['all','جميع الفواتير'],['daily','تقرير يومي'],['monthly','تقرير شهري'],['range','من تاريخ إلى تاريخ']] as const).map(([mode,label]) =>
                  <button key={mode} onClick={() => setReportMode(mode)} className={reportMode === mode ? 'btn-primary' : 'btn-secondary'}>{label}</button>)}
              </div>
              <div className="flex flex-wrap items-end gap-3">
                <label>
                  <span className="block text-sm mb-1">المستخدم</span>
                  <select
                    className="input-field min-w-56"
                    value={reportUserId}
                    onChange={(event) => setReportUserId(event.target.value)}
                    disabled={
                      user?.role === 'user'
                      && user?.permission_mode === 'custom'
                      && user.permissions.includes('scope.own_only')
                    }
                  >
                    <option value="">جميع المستخدمين</option>
                    {reportUsers.map((reportUser) => (
                      <option key={reportUser.id} value={reportUser.id}>
                        {reportUser.arabic_name} (@{reportUser.username})
                      </option>
                    ))}
                  </select>
                </label>
                {reportMode === 'daily' && <label><span className="block text-sm mb-1">اليوم</span><input type="date" className="input-field" value={reportDate} onChange={(e) => setReportDate(e.target.value)} /></label>}
                {reportMode === 'monthly' && <label><span className="block text-sm mb-1">الشهر</span><input type="month" className="input-field" value={reportMonth} onChange={(e) => setReportMonth(e.target.value)} /></label>}
                {reportMode === 'range' && <>
                  <label><span className="block text-sm mb-1">من</span><input type="date" className="input-field" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} /></label>
                  <label><span className="block text-sm mb-1">إلى</span><input type="date" className="input-field" value={dateTo} onChange={(e) => setDateTo(e.target.value)} /></label>
                </>}
                <button onClick={generateReport} className="btn-primary">عرض التقرير</button>
                <button onClick={() => window.print()} className="btn-secondary flex items-center gap-1"><Printer className="w-4 h-4" /> طباعة</button>
              </div>
            </div>
            <section className="card p-6 print-area">
              <header className="text-center border-b-2 border-gray-900 pb-4 mb-5">
                <h1 className="text-2xl font-bold">{officeName}</h1>
                {officeAddress && <p className="text-sm text-gray-500 mt-1">{officeAddress}</p>}
                <h2 className="text-xl font-bold mt-3">تقرير الفواتير</h2>
                <p className="text-sm text-gray-600 mt-1">{reportPeriod}</p>
                <p className="text-sm font-semibold mt-1">المستخدم: {reportUserName}</p>
                <p className="text-xs text-gray-400 mt-1">
                  تاريخ الطباعة: {formatDateShort(new Date().toISOString())}
                </p>
              </header>
              <InvoiceTable invoices={[...invoices].sort((a, b) => a.invoice_number - b.invoice_number)} can={() => false} onEdit={() => {}} onPrint={(i) => openInvoice(i, 'print')} onDelete={() => {}} report />
              <div className="mt-5 rounded-xl border-2 border-gray-800 p-4 space-y-2">
                <div className="flex justify-between font-bold"><span>عدد الفواتير</span><span>{invoices.length}</span></div>
                <div className="flex justify-between text-lg font-bold"><span>إجمالي مبلغ الفواتير للمستخدم والفترة المحددة</span><span>{formatCurrency(reportTotal)}</span></div>
                <p className="border-t pt-2 text-sm">{tafqeet(reportTotal)}</p>
              </div>
            </section>
          </>}
        </div>
      )}

      <Modal isOpen={showService} onClose={() => setShowService(false)} title="إضافة خدمة جديدة">
        <div className="space-y-4"><input className="input-field" value={serviceName} onChange={(e) => setServiceName(e.target.value)} placeholder="مثال: تجديد إقامة" /><button onClick={addService} className="btn-primary w-full">إضافة إلى قائمة الخدمات</button></div>
      </Modal>
      <Modal isOpen={!!printInvoice} onClose={() => setPrintInvoice(null)} title={`طباعة الفاتورة رقم ${printInvoice?.invoice_number || ''}`} size="lg">
        {printInvoice && <InvoicePrint invoice={printInvoice as Invoice & { items: Required<Item>[] }} />}
      </Modal>
    </MainLayout>
  );
}

function InvoiceTable({ invoices, can, onEdit, onPrint, onDelete, report = false }: {
  invoices: Invoice[];
  can: (permission: string) => boolean;
  onEdit: (invoice: Invoice) => void;
  onPrint: (invoice: Invoice) => void;
  onDelete: (invoice: Invoice) => void;
  report?: boolean;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-gray-100"><tr><th className="p-3">رقم الفاتورة</th><th className="p-3">التاريخ</th><th className="p-3 text-right">العميل</th><th className="p-3">المبلغ الإجمالي</th><th className="p-3">اسم المستخدم</th><th className="p-3 print-hidden">الإجراءات</th></tr></thead>
        <tbody className="divide-y">
          {invoices.map((invoice) => <tr key={invoice.id} className="hover:bg-gray-50">
            <td className="p-3 text-center font-bold">{invoice.invoice_number}</td>
            <td className="p-3 text-center">{formatDateShort(invoice.invoice_date)}</td>
            <td className="p-3">{invoice.customer_name || 'عميل نقدي'}</td>
            <td className="p-3 text-center font-bold text-indigo-700">{formatCurrency(invoice.total_amount)}</td>
            <td className="p-3 text-center text-gray-500">{invoice.created_by_name || '—'}</td>
            <td className="p-3 print-hidden"><div className="flex justify-center gap-1">
              {can('invoices.edit') && <button onClick={() => onEdit(invoice)} className="p-2 text-indigo-600" title="تعديل"><Edit2 className="w-4 h-4" /></button>}
              {(can('invoices.print') || report) && <button onClick={() => onPrint(invoice)} className="p-2 text-gray-600" title="طباعة"><Printer className="w-4 h-4" /></button>}
              {can('invoices.delete') && <button onClick={() => onDelete(invoice)} className="p-2 text-red-600" title="حذف"><Trash2 className="w-4 h-4" /></button>}
            </div></td>
          </tr>)}
          {!invoices.length && <tr><td colSpan={6} className="p-10 text-center text-gray-400">لا توجد فواتير مطابقة</td></tr>}
        </tbody>
      </table>
    </div>
  );
}
