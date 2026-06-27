import { ClientType, ContractStatus, VoucherType, OperationType } from './types';

// =========================================================
// دوال تنسيق البيانات
// =========================================================

/** تنسيق المبلغ بالريال السعودي */
export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('ar-SA-u-nu-latn', {
    style: 'currency',
    currency: 'SAR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

/** تنسيق التاريخ بالعربي */
export function formatDate(dateStr: string): string {
  return formatDateShort(dateStr);
}

/** تنسيق التاريخ مختصرًا */
export function formatDateShort(dateStr: string): string {
  if (!dateStr) return '';
  const normalized = dateStr.split('T')[0];
  const [year, month, day] = normalized.split('-');
  if (!year || !month || !day) return toEnglishDigits(normalized);
  return `${toEnglishDigits(year)}/${toEnglishDigits(month.padStart(2, '0'))}/${toEnglishDigits(day.padStart(2, '0'))}`;
}

/** تحويل أي أرقام عربية مدخلة أو مخزنة إلى الأرقام الإنجليزية. */
export function toEnglishDigits(value: string | number): string {
  return String(value)
    .replace(/[٠-٩]/g, (digit) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)))
    .replace(/[۰-۹]/g, (digit) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)));
}

// =========================================================
// دوال ترجمة التسميات
// =========================================================

export function getClientTypeLabel(type: ClientType): string {
  return type === 'debtor' ? 'مدين' : 'دائن';
}

export function getContractStatusLabel(status: ContractStatus): string {
  const map: Record<ContractStatus, string> = {
    active: 'نشط',
    completed: 'مكتمل',
    cancelled: 'ملغي',
  };
  return map[status];
}

export function getVoucherTypeLabel(type: VoucherType): string {
  return type === 'receipt' ? 'سند قبض' : 'سند صرف';
}

export function getOperationTypeLabel(type: OperationType): string {
  return type === 'debit_on_client' ? 'مدين على العميل' : 'دائن على المكتب';
}

export function getOperationTypeShortLabel(type: OperationType): string {
  return type === 'debit_on_client' ? 'مدين' : 'دائن';
}

// =========================================================
// ألوان الحالات
// =========================================================

export function getContractStatusClasses(status: ContractStatus): string {
  const map: Record<ContractStatus, string> = {
    active:    'bg-blue-50 text-blue-700 border border-blue-200',
    completed: 'bg-green-50 text-green-700 border border-green-200',
    cancelled: 'bg-red-50 text-red-700 border border-red-200',
  };
  return map[status];
}

export function getVoucherTypeClasses(type: VoucherType): string {
  return type === 'receipt'
    ? 'bg-green-50 text-green-700 border border-green-200'
    : 'bg-red-50 text-red-700 border border-red-200';
}

export function getOperationTypeClasses(type: OperationType): string {
  return type === 'debit_on_client'
    ? 'bg-orange-50 text-orange-700 border border-orange-200'
    : 'bg-purple-50 text-purple-700 border border-purple-200';
}

// =========================================================
// دمج أسماء الكلاسات بشكل مشروط
// =========================================================
export function cn(...classes: (string | undefined | null | false)[]): string {
  return classes.filter(Boolean).join(' ');
}

/** تحويل التاريخ لصيغة YYYY-MM-DD للـ input[type=date] */
export function toInputDate(dateStr: string): string {
  if (!dateStr) return '';
  return dateStr.split('T')[0];
}
