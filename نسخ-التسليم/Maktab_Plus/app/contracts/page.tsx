'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  Check, ChevronDown, Edit2, ExternalLink, Eye, EyeOff, FileText, Plus,
  Printer, Save, Search, Trash2, X,
} from 'lucide-react';
import MainLayout from '@/components/layout/MainLayout';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import Modal from '@/components/ui/Modal';
import OperationPrint from '@/components/print/OperationPrint';
import StatementPrint from '@/components/print/StatementPrint';
import VoucherPrint from '@/components/print/VoucherPrint';
import ClientForm from '@/components/forms/ClientForm';
import { useAuth } from '@/components/auth/AuthProvider';
import { Client, Contract, OperationType, StatementEntry, Voucher } from '@/lib/types';
import { formatCurrency, formatDateShort, toEnglishDigits } from '@/lib/utils';
import { tafqeet } from '@/lib/tafqeet';

type MovementType = OperationType | 'receipt' | 'payment';

interface MovementDraft {
  contract_date: string;
  description: string;
  movement_type: MovementType;
  total_amount: string;
}

type LedgerRow =
  | { kind: 'operation'; date: string; sequence: number; operation: Contract; debit: number; credit: number; balance: number }
  | { kind: 'voucher'; date: string; sequence: number; voucher: Voucher; debit: number; credit: number; balance: number };

function emptyDraft(): MovementDraft {
  return {
    contract_date: new Date().toISOString().split('T')[0],
    description: '',
    movement_type: 'debit_on_client',
    total_amount: '',
  };
}

function operationLabel(type: OperationType) {
  return type === 'debit_on_client'
    ? 'مدين على العميل / للمكتب'
    : 'مدين على المكتب / دائن للعميل';
}

export default function ContractsPage() {
  const { can } = useAuth();
  const [clients, setClients] = useState<Client[]>([]);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [vouchers, setVouchers] = useState<Voucher[]>([]);
  const [clientSearch, setClientSearch] = useState('');
  const [clientListOpen, setClientListOpen] = useState(false);
  const [loadingClients, setLoadingClients] = useState(true);
  const [loadingLedger, setLoadingLedger] = useState(false);
  const [showNewRow, setShowNewRow] = useState(false);
  const [showStatement, setShowStatement] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [newOperation, setNewOperation] = useState<MovementDraft>(emptyDraft);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<MovementDraft>(emptyDraft);
  const [detailOperation, setDetailOperation] = useState<Contract | null>(null);
  const [printVoucher, setPrintVoucher] = useState<Voucher | null>(null);
  const [showClientForm, setShowClientForm] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const pickerRef = useRef<HTMLDivElement>(null);
  const [movementSearch, setMovementSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [openActionMenu, setOpenActionMenu] = useState<string | null>(null);

  useEffect(() => {
    loadClients();
  }, []);

  function loadClients() {
    return fetch('/api/clients', { cache: 'no-store' })
      .then((response) => response.ok ? response.json() : [])
      .then((data: Client[]) => {
        const list = data ?? [];
        setClients(list);
        return list;
      })
      .finally(() => setLoadingClients(false));
  }

  useEffect(() => {
    function closePicker(event: MouseEvent) {
      if (!pickerRef.current?.contains(event.target as Node)) setClientListOpen(false);
      if (!(event.target as Element).closest('[data-action-menu]')) setOpenActionMenu(null);
    }
    document.addEventListener('mousedown', closePicker);
    return () => document.removeEventListener('mousedown', closePicker);
  }, []);

  const loadLedger = useCallback(async (clientId: string) => {
    setLoadingLedger(true);
    const [operationData, voucherData] = await Promise.all([
      fetch(`/api/contracts?client_id=${encodeURIComponent(clientId)}`).then((response) => response.json()),
      fetch(`/api/vouchers?client_id=${encodeURIComponent(clientId)}`).then((response) => response.json()),
    ]);
    setContracts((operationData as Contract[]) ?? []);
    setVouchers((voucherData as Voucher[]) ?? []);
    setLoadingLedger(false);
  }, []);

  function selectClient(client: Client) {
    setSelectedClient(client);
    setClientSearch(client.name);
    setClientListOpen(false);
    setShowNewRow(false);
    setShowStatement(false);
    setEditingId(null);
    setError('');
    setNewOperation(emptyDraft());
    loadLedger(client.id);
  }

  const filteredClients = useMemo(() => {
    const selectedNameIsDisplayed = Boolean(
      selectedClient && clientSearch.trim() === selectedClient.name.trim()
    );
    const query = selectedNameIsDisplayed ? '' : clientSearch.trim().toLowerCase();
    if (!query) return clients;
    return clients.filter((client) =>
      client.name.toLowerCase().includes(query) ||
      toEnglishDigits(client.phone ?? '').includes(toEnglishDigits(query))
    );
  }, [clients, clientSearch]);

  const openingBalance = selectedClient
    ? (selectedClient.type === 'creditor' ? -Math.abs(selectedClient.opening_balance) : Math.abs(selectedClient.opening_balance))
    : 0;

  const ledgerRows = useMemo<LedgerRow[]>(() => {
    if (!selectedClient) return [];
    const movements = [
      ...contracts.map((operation) => ({
        kind: 'operation' as const,
        date: operation.contract_date,
        sequence: operation.contract_number,
        operation,
        debit: operation.operation_type === 'debit_on_client' ? operation.total_amount : 0,
        credit: operation.operation_type === 'credit_on_client' ? operation.total_amount : 0,
      })),
      ...vouchers.map((voucher) => ({
        kind: 'voucher' as const,
        date: voucher.payment_date,
        sequence: voucher.voucher_number,
        voucher,
        // سند القبض يسدد ما على العميل، وسند الصرف يزيد ما للمكتب على العميل.
        debit: voucher.voucher_type === 'payment' ? voucher.amount : 0,
        credit: voucher.voucher_type === 'receipt' ? voucher.amount : 0,
      })),
    ].sort((a, b) =>
      a.date.localeCompare(b.date) ||
      (a.kind === b.kind ? a.sequence - b.sequence : a.kind === 'operation' ? -1 : 1)
    );

    let balance = openingBalance;
    return movements.map((movement) => {
      balance += movement.debit - movement.credit;
      return { ...movement, balance } as LedgerRow;
    });
  }, [contracts, vouchers, selectedClient, openingBalance]);

  const totalDebit = ledgerRows.reduce((sum, row) => sum + row.debit, 0);
  const totalCredit = ledgerRows.reduce((sum, row) => sum + row.credit, 0);
  const finalBalance = ledgerRows.length ? ledgerRows[ledgerRows.length - 1].balance : openingBalance;

  const visibleLedgerRows = useMemo(() => {
    const query = movementSearch.trim().toLowerCase();
    return ledgerRows.filter((row) => {
      if (dateFrom && row.date < dateFrom) return false;
      if (dateTo && row.date > dateTo) return false;
      if (!query) return true;
      const number = row.kind === 'operation'
        ? String(row.operation.contract_number)
        : String(row.voucher.voucher_number);
      const description = row.kind === 'operation'
        ? row.operation.description
        : (row.voucher.description || '');
      const type = row.kind === 'operation'
        ? operationLabel(row.operation.operation_type)
        : (row.voucher.voucher_type === 'receipt' ? 'سند قبض من العميل' : 'سند صرف للعميل');
      return [number, description, type].some((value) => value.toLowerCase().includes(query));
    });
  }, [ledgerRows, movementSearch, dateFrom, dateTo]);

  const statementEntries = useMemo<StatementEntry[]>(() => ledgerRows.map((row) => ({
    date: row.date,
    operationNumber: row.kind === 'operation' ? row.operation.contract_number : undefined,
    operationType: row.kind === 'operation' ? row.operation.operation_type : undefined,
    voucherNumber: row.kind === 'voucher' ? row.voucher.voucher_number : undefined,
    voucherType: row.kind === 'voucher' ? row.voucher.voucher_type : undefined,
    description: row.kind === 'operation'
      ? `عملية رقم ${row.operation.contract_number}: ${row.operation.description}`
      : (row.voucher.description || `${row.voucher.voucher_type === 'receipt' ? 'سند قبض' : 'سند صرف'} رقم ${row.voucher.voucher_number}`),
    debit: row.debit,
    credit: row.credit,
    balance: row.balance,
  })), [ledgerRows]);

  async function persistMovement(draft: MovementDraft, current?: Contract | Voucher) {
    if (!selectedClient) return;
    setError('');
    const amount = Number.parseFloat(draft.total_amount);
    const isVoucher = draft.movement_type === 'receipt' || draft.movement_type === 'payment';
    if (isVoucher && !current && contracts.length === 0) {
      return setError('هذا العميل ليست له عمليات مسجلة. أولاً قم بتسجيل عملية مدينة أو دائنة للعميل، ثم أصدر السند.');
    }
    if (!isVoucher && !draft.description.trim()) return setError('يرجى كتابة بيان العملية.');
    if (!amount || amount <= 0) return setError('يرجى إدخال مبلغ صحيح أكبر من صفر.');
    if (!draft.contract_date) return setError('يرجى اختيار تاريخ العملية.');

    setSaving(true);
    const endpoint = isVoucher
      ? (current ? `/api/vouchers/${current.id}` : '/api/vouchers')
      : (current ? `/api/contracts/${current.id}` : '/api/contracts');
    const response = await fetch(endpoint, {
      method: current ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(isVoucher ? {
        voucher_type: draft.movement_type,
        client_id: selectedClient.id,
        amount,
        amount_text: tafqeet(amount),
        payment_date: draft.contract_date,
        description: null,
      } : {
        client_id: selectedClient.id,
        description: draft.description.trim(),
        total_amount: amount,
        operation_type: draft.movement_type,
        contract_date: draft.contract_date,
        status: current && 'status' in current ? current.status : 'active',
        notes: current && 'notes' in current ? current.notes : null,
      }),
    });
    setSaving(false);

    if (!response.ok) return setError('تعذر حفظ العملية. يرجى المحاولة مرة أخرى.');
    setNewOperation(emptyDraft());
    setShowNewRow(false);
    setEditingId(null);
    await loadLedger(selectedClient.id);
  }

  function startEditing(operation: Contract) {
    setShowNewRow(false);
    setError('');
    setEditingId(operation.id);
    setEditDraft({
      contract_date: operation.contract_date.split('T')[0],
      description: operation.description,
      movement_type: operation.operation_type,
      total_amount: String(operation.total_amount),
    });
  }

  function startEditingVoucher(voucher: Voucher) {
    setShowNewRow(false);
    setError('');
    setEditingId(voucher.id);
    setEditDraft({
      contract_date: voucher.payment_date.split('T')[0],
      description: '',
      movement_type: voucher.voucher_type,
      total_amount: String(voucher.amount),
    });
  }

  async function deleteMovement(row: LedgerRow) {
    const isOperation = row.kind === 'operation';
    const number = isOperation ? row.operation.contract_number : row.voucher.voucher_number;
    const label = isOperation
      ? `العملية رقم ${number}`
      : `${row.voucher.voucher_type === 'receipt' ? 'سند القبض' : 'سند الصرف'} رقم ${number}`;
    if (!window.confirm(`هل تريد حذف ${label} نهائيًا؟\nسيتم تحديث رصيد العميل بعد الحذف.`)) return;

    setError('');
    const endpoint = isOperation
      ? `/api/contracts/${row.operation.id}`
      : `/api/vouchers/${row.voucher.id}`;
    const response = await fetch(endpoint, { method: 'DELETE' });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(data.error || `تعذر حذف ${label}`);
      return;
    }
    if (editingId === (isOperation ? row.operation.id : row.voucher.id)) setEditingId(null);
    if (selectedClient) await loadLedger(selectedClient.id);
  }

  async function deleteSelectedClient() {
    if (!selectedClient) return;
    const confirmed = window.confirm(
      `تحذير: هل تريد حذف العميل «${selectedClient.name}» نهائيًا؟\n\n`
      + 'سيؤدي الحذف إلى حذف جميع بياناته المرتبطة، بما فيها العمليات والسندات وسجل حركاته، ولا يمكن التراجع عن ذلك.'
    );
    if (!confirmed) return;

    setError('');
    const response = await fetch(`/api/clients/${selectedClient.id}`, { method: 'DELETE' });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(data.error || 'تعذر حذف العميل');
      return;
    }

    setClients((current) => current.filter((client) => client.id !== selectedClient.id));
    setSelectedClient(null);
    setClientSearch('');
    setContracts([]);
    setVouchers([]);
    setShowNewRow(false);
    setShowStatement(false);
    setEditingId(null);
    setMessageAfterDelete(data.deleted);
  }

  function setMessageAfterDelete(deleted?: { contracts?: number; vouchers?: number }) {
    const details = deleted
      ? ` حُذفت معه ${deleted.contracts ?? 0} عملية و${deleted.vouchers ?? 0} سند.`
      : '';
    window.alert(`تم حذف العميل وجميع بياناته بنجاح.${details}`);
  }

  function draftCells(draft: MovementDraft, update: (draft: MovementDraft) => void) {
    const isVoucher = draft.movement_type === 'receipt' || draft.movement_type === 'payment';
    return (
      <>
        <td className="border border-blue-300 p-2">
          <input
            type="date"
            value={draft.contract_date}
            onChange={(event) => update({ ...draft, contract_date: event.target.value })}
            className="input-field text-xs px-2"
            dir="ltr"
          />
        </td>
        <td className="border border-blue-300 p-2 min-w-[420px]">
          {isVoucher ? (
            <div className="min-h-24 rounded-lg border border-dashed border-gray-300 bg-gray-100 px-4 py-6 text-center text-sm text-gray-500">
              البيان مخفي لأن الحركة ستُسجل كسند {draft.movement_type === 'receipt' ? 'قبض' : 'صرف'}
            </div>
          ) : (
            <textarea
              value={draft.description}
              onChange={(event) => update({ ...draft, description: event.target.value })}
              placeholder="اكتب بيان العملية بالتفصيل..."
              className="input-field min-h-24 resize-y text-base leading-7"
              autoFocus
            />
          )}
        </td>
        <td className="border border-blue-300 p-2">
          <select
            value={draft.movement_type}
            onChange={(event) => update({
              ...draft,
              movement_type: event.target.value as MovementType,
              description: ['receipt', 'payment'].includes(event.target.value) ? '' : draft.description,
            })}
            className="input-field text-xs min-w-[210px]"
          >
            <option value="debit_on_client">مدين على العميل / للمكتب</option>
            <option value="credit_on_client">مدين على المكتب / دائن للعميل</option>
            <option value="receipt">سند قبض من العميل</option>
            <option value="payment">سند صرف للعميل</option>
          </select>
        </td>
        <td className="border border-blue-300 p-2" colSpan={2}>
          <input
            value={draft.total_amount}
            onChange={(event) => {
              const value = toEnglishDigits(event.target.value).replace(',', '.');
              if (/^\d*(?:\.\d{0,2})?$/.test(value)) update({ ...draft, total_amount: value });
            }}
            placeholder="0.00"
            inputMode="decimal"
            className="input-field text-left"
            dir="ltr"
          />
        </td>
      </>
    );
  }

  function movementEditor(
    draft: MovementDraft,
    update: (draft: MovementDraft) => void,
    onSave: () => void,
    onCancel: () => void,
    title: string,
  ) {
    const isVoucher = draft.movement_type === 'receipt' || draft.movement_type === 'payment';
    const canUseOperations = editingId ? can('operations.edit') : can('operations.create');
    const canUseVouchers = editingId ? can('vouchers.edit') : can('vouchers.create');
    return (
      <div className="m-4 rounded-2xl border-2 border-indigo-200 bg-indigo-50/50 p-5">
        <div className="mb-5 flex items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-bold text-gray-900">{title}</h3>
            <p className="mt-1 text-sm text-gray-500">أدخل بيانات الحركة عموديًا ثم اضغط حفظ.</p>
          </div>
          <button type="button" onClick={onCancel} className="rounded-lg border border-gray-300 bg-white p-2 text-gray-600" title="إلغاء">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-gray-700">تاريخ الحركة</label>
            <input type="date" value={draft.contract_date}
              onChange={(event) => update({ ...draft, contract_date: event.target.value })}
              className="input-field" dir="ltr" />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-gray-700">نوع الحركة</label>
            <select value={draft.movement_type}
              onChange={(event) => update({
                ...draft,
                movement_type: event.target.value as MovementType,
                description: ['receipt', 'payment'].includes(event.target.value) ? '' : draft.description,
              })}
              className="input-field">
              {canUseOperations && <option value="debit_on_client">مدين على العميل / للمكتب</option>}
              {canUseOperations && <option value="credit_on_client">مدين على المكتب / دائن للعميل</option>}
              {canUseVouchers && <option value="receipt">سند قبض من العميل</option>}
              {canUseVouchers && <option value="payment">سند صرف للعميل</option>}
            </select>
          </div>
          <div className="lg:col-span-2">
            <label className="mb-1.5 block text-sm font-semibold text-gray-700">بيان العملية</label>
            {isVoucher ? (
              <div className="rounded-xl border border-dashed border-gray-300 bg-white px-4 py-5 text-center text-sm text-gray-500">
                البيان غير مطلوب لأن الحركة ستُسجل كسند {draft.movement_type === 'receipt' ? 'قبض' : 'صرف'}.
              </div>
            ) : (
              <textarea value={draft.description}
                onChange={(event) => update({ ...draft, description: event.target.value })}
                placeholder="اكتب بيان العملية بالتفصيل..."
                className="input-field min-h-28 resize-y text-base leading-7" autoFocus />
            )}
          </div>
          <div className="lg:col-span-2">
            <label className="mb-1.5 block text-sm font-semibold text-gray-700">المبلغ</label>
            <input value={draft.total_amount}
              onChange={(event) => {
                const value = toEnglishDigits(event.target.value).replace(',', '.');
                if (/^\d*(?:\.\d{0,2})?$/.test(value)) update({ ...draft, total_amount: value });
              }}
              placeholder="0.00" inputMode="decimal"
              className="input-field text-left text-lg font-bold" dir="ltr" />
          </div>
        </div>
        <div className="mt-5 flex flex-wrap justify-end gap-3">
          <button type="button" onClick={onCancel} className="btn-secondary flex items-center gap-2">
            <X className="h-4 w-4" /> إلغاء
          </button>
          <button type="button" onClick={onSave} disabled={saving} className="btn-primary flex items-center gap-2">
            <Save className="h-4 w-4" /> {saving ? 'جارٍ الحفظ...' : 'حفظ الحركة'}
          </button>
        </div>
      </div>
    );
  }

  const editingMovement = editingId
    ? contracts.find((operation) => operation.id === editingId)
      ?? vouchers.find((voucher) => voucher.id === editingId)
    : undefined;
  const renderInlineEditor: boolean = false;

  return (
    <MainLayout
      permission="operations.view"
      title="تسجيل العمليات"
      subtitle={selectedClient ? `دفتر حركات العميل: ${selectedClient.name}` : 'اختر العميل لعرض وتسجيل حركاته'}
    >
      <div className="ledger-screen">
        <div className="card p-5 mb-5 overflow-visible">
          <div className="flex items-center justify-between gap-3 mb-2">
            <label className="block text-sm font-semibold text-gray-800">اختيار العميل</label>
            {can('clients.create') && (
              <button type="button" onClick={() => { setEditingClient(null); setShowClientForm(true); }} className="btn-primary flex items-center gap-2">
                <Plus className="w-4 h-4" /> عميل جديد
              </button>
            )}
          </div>
          <div ref={pickerRef} className="relative max-w-2xl">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 z-10" />
            <input
              value={clientSearch}
              onFocus={() => setClientListOpen(true)}
              onChange={(event) => {
                setClientSearch(event.target.value);
                setSelectedClient(null);
                setContracts([]);
                setVouchers([]);
                setClientListOpen(true);
              }}
              placeholder="ابحث باسم العميل أو رقم الجوال..."
              className="input-field pr-10 pl-10"
              autoComplete="off"
            />
            <ChevronDown className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            {clientListOpen && (
              <div className="absolute z-50 mt-1 w-full max-h-72 overflow-y-auto rounded-xl border border-gray-200 bg-white shadow-xl">
                {loadingClients ? (
                  <p className="px-4 py-5 text-center text-sm text-gray-400">جارٍ تحميل العملاء...</p>
                ) : filteredClients.length === 0 ? (
                  <p className="px-4 py-5 text-center text-sm text-gray-400">لا يوجد عميل مطابق</p>
                ) : filteredClients.map((client) => (
                  <button key={client.id} type="button" onClick={() => selectClient(client)}
                    className="w-full flex items-center justify-between gap-3 px-4 py-3 text-right hover:bg-indigo-50 border-b border-gray-50 last:border-0">
                    <span>
                      <span className="block font-semibold text-gray-900">{client.name}</span>
                      <span className="block text-xs text-gray-500 mt-0.5" dir="ltr">
                        {client.phone ? toEnglishDigits(client.phone) : 'بدون رقم جوال'}
                      </span>
                    </span>
                    {selectedClient?.id === client.id && <Check className="w-4 h-4 text-indigo-600" />}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {!selectedClient ? (
          <div className="card flex flex-col items-center justify-center py-28 text-gray-400">
            <Search className="w-12 h-12 mb-3 text-gray-200" />
            <p>اختر عميلاً من قائمة البحث لفتح دفتر حركاته</p>
          </div>
        ) : loadingLedger ? (
          <div className="card flex items-center justify-center py-28"><LoadingSpinner /></div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-5">
              <div className="card p-4 text-center">
                <p className="text-xs text-gray-500">إجمالي المدين</p>
                <p className="text-xl font-bold text-orange-700 mt-1">{formatCurrency(totalDebit)}</p>
              </div>
              <div className="card p-4 text-center">
                <p className="text-xs text-gray-500">إجمالي الدائن</p>
                <p className="text-xl font-bold text-purple-700 mt-1">{formatCurrency(totalCredit)}</p>
              </div>
              <div className="card p-4 text-center border-red-200">
                <p className="text-xs text-gray-600">الرصيد الحالي</p>
                <p className="text-2xl font-extrabold text-red-900 mt-1">
                  {formatCurrency(Math.abs(finalBalance))}
                  <span className="text-base mr-2">
                    {finalBalance > 0 ? 'مدين على العميل' : finalBalance < 0 ? 'مدين على المكتب' : 'مسدد'}
                  </span>
                </p>
              </div>
            </div>

            <div className="card">
              <div className="p-4 border-b border-gray-200 bg-white space-y-3">
                <div className="relative">
                  <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    value={movementSearch}
                    onChange={(event) => setMovementSearch(event.target.value)}
                    placeholder="ابحث بأي جزء من رقم العملية أو السند، بيان العملية، أو نوع الحركة..."
                    className="input-field pr-10"
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-3 items-end">
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1">من تاريخ</label>
                    <input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)}
                      className="input-field" dir="ltr" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1">إلى تاريخ</label>
                    <input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)}
                      className="input-field" dir="ltr" />
                  </div>
                  <button
                    type="button"
                    onClick={() => { setMovementSearch(''); setDateFrom(''); setDateTo(''); }}
                    className="btn-secondary h-[42px]"
                  >
                    مسح البحث
                  </button>
                </div>
                <p className="text-xs text-gray-500">
                  لعرض تاريخ معين أدخل التاريخ نفسه في خانتي «من» و«إلى».
                </p>
              </div>
              <div className="px-5 py-4 border-b border-gray-200 flex flex-wrap items-center justify-between gap-3 bg-gray-50">
                <div>
                  <h2 className="font-bold text-gray-900">دفتر حركات {selectedClient.name}</h2>
                  <p className="text-xs text-gray-500 mt-1">يشمل العمليات وسندات القبض والصرف ويحدّث الرصيد بعد كل حركة</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Link href={`/clients/${selectedClient.id}`} className="btn-secondary flex items-center gap-2">
                    <ExternalLink className="w-4 h-4" /> ملف العميل
                  </Link>
                  {can('clients.edit') && (
                    <button
                      type="button"
                      onClick={() => { setEditingClient(selectedClient); setShowClientForm(true); }}
                      className="btn-secondary flex items-center gap-2"
                    >
                      <Edit2 className="w-4 h-4" /> تعديل بيانات العميل
                    </button>
                  )}
                  {can('clients.delete') && (
                    <button
                      type="button"
                      onClick={deleteSelectedClient}
                      className="btn-danger flex items-center gap-2"
                    >
                      <Trash2 className="w-4 h-4" /> حذف العميل
                    </button>
                  )}
                  {can('statements.view') && (
                    <button onClick={() => setShowStatement((value) => !value)} className="btn-secondary flex items-center gap-2">
                      {showStatement ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      {showStatement ? 'إخفاء التقرير' : 'عرض التقرير'}
                    </button>
                  )}
                  {(can('operations.create') || can('vouchers.create')) && (
                    <button
                      onClick={() => {
                        setNewOperation({
                          ...emptyDraft(),
                          movement_type: can('operations.create') ? 'debit_on_client' : 'receipt',
                        });
                        setShowNewRow(true);
                        setEditingId(null);
                        setError('');
                      }}
                      className="btn-primary flex items-center gap-2"
                      disabled={showNewRow}
                    >
                      <Plus className="w-4 h-4" /> تسجيل عملية جديدة
                    </button>
                  )}
                </div>
              </div>

              {showNewRow && movementEditor(
                newOperation,
                setNewOperation,
                () => persistMovement(newOperation),
                () => { setShowNewRow(false); setError(''); setNewOperation(emptyDraft()); },
                'تسجيل حركة جديدة',
              )}
              {editingId && editingMovement && movementEditor(
                editDraft,
                setEditDraft,
                () => persistMovement(editDraft, editingMovement),
                () => setEditingId(null),
                'تعديل بيانات الحركة',
              )}

              <div className="w-full overflow-visible">
                <table className="w-full text-sm border-collapse table-fixed">
                  <colgroup>
                    <col className="w-[6%]" />
                    <col className="w-[10%]" />
                    <col className="w-[31%]" />
                    <col className="w-[16%]" />
                    <col className="w-[9%]" />
                    <col className="w-[9%]" />
                    <col className="w-[12%]" />
                    <col className="w-[7%]" />
                  </colgroup>
                  <thead>
                    <tr className="bg-green-800 text-white">
                      <th className="border border-green-900 px-3 py-3 text-center">الرقم</th>
                      <th className="border border-green-900 px-3 py-3 text-center">التاريخ</th>
                      <th className="border border-green-900 px-3 py-3 text-right">بيان العملية</th>
                      <th className="border border-green-900 px-3 py-3 text-center">نوع الحركة</th>
                      <th className="border border-green-900 px-3 py-3 text-left">مدين</th>
                      <th className="border border-green-900 px-3 py-3 text-left">دائن</th>
                      <th className="border border-green-900 px-3 py-3 text-left">الرصيد</th>
                      <th className="border border-green-900 px-3 py-3 text-center">الإجراءات</th>
                    </tr>
                  </thead>
                  <tbody>
                    {openingBalance !== 0 && (
                      <tr className="bg-amber-50">
                        <td className="border border-gray-300 px-3 py-3 text-center">0</td>
                        <td className="border border-gray-300 px-3 py-3 text-center">-</td>
                        <td className="border border-gray-300 px-3 py-3 font-semibold">الرصيد الافتتاحي</td>
                        <td className="border border-gray-300 px-3 py-3 text-center">افتتاحي</td>
                        <td className="border border-gray-300 px-3 py-3 text-left">{openingBalance > 0 ? formatCurrency(openingBalance) : '-'}</td>
                        <td className="border border-gray-300 px-3 py-3 text-left">{openingBalance < 0 ? formatCurrency(-openingBalance) : '-'}</td>
                        <td className="border border-gray-300 px-3 py-3 text-left font-bold">{formatCurrency(Math.abs(openingBalance))}</td>
                        <td className="border border-gray-300 px-3 py-3" />
                      </tr>
                    )}

                    {visibleLedgerRows.map((row, index) => {
                      const currentId = row.kind === 'operation' ? row.operation.id : row.voucher.id;
                      if (editingId === currentId && renderInlineEditor) {
                        const current = 'operation' in row ? row.operation : row.voucher;
                        return (
                          <tr key={currentId} className="bg-blue-50 align-top">
                            <td className="border border-blue-300 px-3 py-3 text-center font-mono">
                              {row.kind === 'operation' ? row.operation.contract_number : `س ${row.voucher.voucher_number}`}
                            </td>
                            {draftCells(editDraft, setEditDraft)}
                            <td className="border border-blue-300 px-3 py-3 text-center text-xs text-gray-500">يتحدث بعد الحفظ</td>
                            <td className="border border-blue-300 p-2">
                              <div className="flex justify-center gap-2">
                                <button onClick={() => persistMovement(editDraft, current)} disabled={saving}
                                  className="p-2 rounded-lg bg-green-600 text-white" title="حفظ التعديل"><Save className="w-4 h-4" /></button>
                                <button onClick={() => setEditingId(null)}
                                  className="p-2 rounded-lg bg-white border border-gray-300" title="إلغاء"><X className="w-4 h-4" /></button>
                              </div>
                            </td>
                          </tr>
                        );
                      }

                      const isOperation = row.kind === 'operation';
                      const description = isOperation
                        ? row.operation.description
                        : (row.voucher.description || `${row.voucher.voucher_type === 'receipt' ? 'سند قبض' : 'سند صرف'} رقم ${row.voucher.voucher_number}`);
                      const typeLabel = isOperation
                        ? operationLabel(row.operation.operation_type)
                        : (row.voucher.voucher_type === 'receipt' ? 'سند قبض من العميل' : 'سند صرف للعميل');

                      return (
                        <tr key={`${row.kind}-${isOperation ? row.operation.id : row.voucher.id}`}
                          className={index % 2 === 0 ? 'bg-white' : 'bg-green-50/40'}>
                          <td className="border border-gray-300 px-3 py-3 text-center font-mono">
                            {isOperation ? row.operation.contract_number : `س ${row.voucher.voucher_number}`}
                          </td>
                          <td className="border border-gray-300 px-3 py-3 text-center whitespace-nowrap" dir="ltr">
                            {formatDateShort(row.date)}
                          </td>
                          <td className="border border-gray-300 px-4 py-3 text-base leading-7 whitespace-pre-wrap break-words">
                            {description}
                          </td>
                          <td className="border border-gray-300 px-3 py-3 text-center">{typeLabel}</td>
                          <td className="border border-gray-300 px-3 py-3 text-left font-semibold text-orange-700">{row.debit ? formatCurrency(row.debit) : '-'}</td>
                          <td className="border border-gray-300 px-3 py-3 text-left font-semibold text-purple-700">{row.credit ? formatCurrency(row.credit) : '-'}</td>
                          <td className="border border-gray-300 px-3 py-3 text-left font-bold">
                            {formatCurrency(Math.abs(row.balance))}
                            <span className="text-xs text-gray-500 mr-1">{row.balance >= 0 ? 'على العميل' : 'على المكتب'}</span>
                          </td>
                          <td className="border border-gray-300 px-2 py-3 text-center">
                            <div className="relative inline-block" data-action-menu>
                              <button
                                type="button"
                                onClick={() => setOpenActionMenu((current) => current === currentId ? null : currentId)}
                                className="inline-flex items-center gap-1 rounded-lg border border-gray-300 bg-white px-2.5 py-2 text-xs font-semibold text-gray-700 shadow-sm transition hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700"
                                aria-expanded={openActionMenu === currentId}
                                aria-label="فتح قائمة الإجراءات"
                              >
                                إجراءات
                                <ChevronDown className={`h-3.5 w-3.5 transition-transform ${openActionMenu === currentId ? 'rotate-180' : ''}`} />
                              </button>

                              {openActionMenu === currentId && (
                                <div className="absolute bottom-full left-1/2 z-50 mb-2 min-w-40 -translate-x-1/2 overflow-hidden rounded-xl border border-gray-200 bg-white py-1 text-right shadow-2xl">
                                  {isOperation ? (
                                    <>
                                      <Link
                                        href={`/contracts/${row.operation.id}`}
                                        onClick={() => setOpenActionMenu(null)}
                                        className="flex w-full items-center gap-2 px-3 py-2.5 text-sm text-indigo-700 hover:bg-indigo-50"
                                      >
                                        <FileText className="h-4 w-4" /> التفاصيل
                                      </Link>
                                      {can('operations.edit') && (
                                        <button onClick={() => { setOpenActionMenu(null); startEditing(row.operation); }} className="flex w-full items-center gap-2 px-3 py-2.5 text-sm text-amber-700 hover:bg-amber-50">
                                          <Edit2 className="h-4 w-4" /> تعديل
                                        </button>
                                      )}
                                      {can('operations.print') && (
                                        <button onClick={() => { setOpenActionMenu(null); setDetailOperation(row.operation); }} className="flex w-full items-center gap-2 px-3 py-2.5 text-sm text-green-700 hover:bg-green-50">
                                          <Printer className="h-4 w-4" /> طباعة
                                        </button>
                                      )}
                                      {can('operations.delete') && (
                                        <button onClick={() => { setOpenActionMenu(null); void deleteMovement(row); }} className="flex w-full items-center gap-2 px-3 py-2.5 text-sm text-red-700 hover:bg-red-50">
                                          <Trash2 className="h-4 w-4" /> حذف
                                        </button>
                                      )}
                                    </>
                                  ) : (
                                    <>
                                      {can('vouchers.edit') && (
                                        <button onClick={() => { setOpenActionMenu(null); startEditingVoucher(row.voucher); }} className="flex w-full items-center gap-2 px-3 py-2.5 text-sm text-amber-700 hover:bg-amber-50">
                                          <Edit2 className="h-4 w-4" /> تعديل السند
                                        </button>
                                      )}
                                      {can('vouchers.print') && (
                                        <button onClick={() => { setOpenActionMenu(null); setPrintVoucher(row.voucher); }} className="flex w-full items-center gap-2 px-3 py-2.5 text-sm text-indigo-700 hover:bg-indigo-50">
                                          <Printer className="h-4 w-4" /> طباعة السند
                                        </button>
                                      )}
                                      {can('vouchers.delete') && (
                                        <button onClick={() => { setOpenActionMenu(null); void deleteMovement(row); }} className="flex w-full items-center gap-2 px-3 py-2.5 text-sm text-red-700 hover:bg-red-50">
                                          <Trash2 className="h-4 w-4" /> حذف السند
                                        </button>
                                      )}
                                    </>
                                  )}
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}

                    {false && showNewRow && (
                      <tr className="bg-blue-50 align-top">
                        <td className="border border-blue-300 px-3 py-3 text-center font-semibold text-gray-500">تلقائي</td>
                        {draftCells(newOperation, setNewOperation)}
                        <td className="border border-blue-300 px-3 py-3 text-center text-xs text-gray-500">يُحسب بعد الحفظ</td>
                        <td className="border border-blue-300 p-2">
                          <div className="flex justify-center gap-2">
                            <button onClick={() => persistMovement(newOperation)} disabled={saving}
                              className="p-2 rounded-lg bg-green-600 text-white" title="حفظ"><Save className="w-4 h-4" /></button>
                            <button onClick={() => { setShowNewRow(false); setError(''); setNewOperation(emptyDraft()); }}
                              className="p-2 rounded-lg bg-white border border-gray-300" title="إلغاء"><X className="w-4 h-4" /></button>
                          </div>
                        </td>
                      </tr>
                    )}

                    {!showNewRow && visibleLedgerRows.length === 0 && openingBalance === 0 && (
                      <tr><td colSpan={8} className="border border-gray-300 px-4 py-12 text-center text-gray-400">
                        {ledgerRows.length === 0
                          ? 'لا توجد حركات لهذا العميل. اضغط «تسجيل عملية جديدة» لإضافة أول حركة.'
                          : 'لا توجد حركات مطابقة للبحث أو الفترة المحددة.'}
                      </td></tr>
                    )}
                  </tbody>
                  <tfoot>
                    <tr className="bg-gray-900 text-white">
                      <td colSpan={4} className="border border-gray-700 px-3 py-3 text-center font-bold">الإجمالي والرصيد الحالي</td>
                      <td className="border border-gray-700 px-3 py-3 text-left font-bold">{formatCurrency(totalDebit)}</td>
                      <td className="border border-gray-700 px-3 py-3 text-left font-bold">{formatCurrency(totalCredit)}</td>
                      <td colSpan={2} className="border border-gray-700 px-3 py-3 text-center">
                        <span className="text-xl font-extrabold text-red-300">
                          {formatCurrency(Math.abs(finalBalance))} {finalBalance > 0 ? 'على العميل' : finalBalance < 0 ? 'على المكتب' : 'مسدد'}
                        </span>
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
              {error && <div className="m-4 bg-red-50 border border-red-200 text-red-800 rounded-lg px-4 py-3 text-sm">{error}</div>}
            </div>
          </>
        )}
      </div>

      {showStatement && selectedClient && can('statements.view') && (
        <div className="statement-print-source mt-6 card p-4">
          <StatementPrint client={selectedClient} entries={statementEntries} filter="all" />
        </div>
      )}

      <Modal isOpen={!!detailOperation} onClose={() => setDetailOperation(null)} title="تفاصيل وطباعة العملية" size="lg">
        {detailOperation && selectedClient && <OperationPrint operation={detailOperation} client={selectedClient} />}
      </Modal>

      <Modal isOpen={!!printVoucher} onClose={() => setPrintVoucher(null)} title="تفاصيل وطباعة السند" size="lg">
        {printVoucher && selectedClient && (
          <VoucherPrint voucher={{ ...printVoucher, clients: selectedClient }} />
        )}
      </Modal>

      <Modal
        isOpen={showClientForm}
        onClose={() => { setShowClientForm(false); setEditingClient(null); }}
        title={editingClient ? 'تعديل بيانات العميل' : 'إضافة عميل جديد'}
      >
        <ClientForm
          client={editingClient ?? undefined}
          onSuccess={async (savedClient) => {
            setShowClientForm(false);
            if (editingClient) {
              setClients((current) => current.map((client) =>
                client.id === savedClient.id ? savedClient : client
              ));
              setSelectedClient(savedClient);
              setClientSearch(savedClient.name);
            } else {
              setClients((current) => [
                savedClient,
                ...current.filter((client) => client.id !== savedClient.id),
              ]);
              selectClient(savedClient);
            }
            setEditingClient(null);
            setLoadingClients(true);
            await loadClients();
          }}
          onCancel={() => { setShowClientForm(false); setEditingClient(null); }}
        />
      </Modal>
    </MainLayout>
  );
}
