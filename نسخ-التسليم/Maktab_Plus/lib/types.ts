// =========================================================
// أنواع TypeScript لتطبيق مكتب خدمات عامة
// =========================================================

export type ClientType = 'creditor' | 'debtor';
// creditor = دائن | debtor = مدين

export type ContractStatus = 'active' | 'completed' | 'cancelled';
// active = نشط | completed = مكتمل | cancelled = ملغي

export type VoucherType = 'receipt' | 'payment';
// receipt = سند قبض | payment = سند صرف

export type PaymentMethod = 'cash' | 'bank_transfer' | 'check';
// cash = نقدي | bank_transfer = حوالة بنكية | check = شيك

export type OperationType = 'debit_on_client' | 'credit_on_client';
// debit_on_client = مدين على العميل (العميل يدفع للمكتب)
// credit_on_client = دائن على المكتب (المكتب يدفع للعميل)

// =========================================================
export interface Client {
  id: string;
  name: string;
  phone: string | null;
  type: ClientType;
  opening_balance: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

// =========================================================
export interface Contract {
  id: string;
  contract_number: number;
  client_id: string;
  description: string;
  total_amount: number;
  operation_type: OperationType;
  contract_date: string;
  status: ContractStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
  // علاقات (جوين)
  clients?: Client;
}

// =========================================================
export interface Voucher {
  id: string;
  voucher_number: number;
  voucher_type: VoucherType;
  client_id: string;
  amount: number;
  amount_text: string;
  payment_method: PaymentMethod;
  payment_date: string;
  description: string | null;
  created_at: string;
  // علاقات (جوين)
  clients?: Client;
}

// =========================================================
export interface DashboardStats {
  totalReceivables: number;   // إجمالي المستحقات للمكتب (عمليات مدينة - سندات قبض)
  totalPayables: number;      // إجمالي المستحقات على المكتب (عمليات دائنة - سندات صرف)
  activeOperations: number;   // عدد العمليات النشطة
  totalClients: number;       // إجمالي العملاء
  completedOperations: number;// عدد العمليات المكتملة
}

// =========================================================
// نوع مساعد لبنود كشف الحساب
export interface StatementEntry {
  date: string;
  voucherNumber?: number;
  voucherType?: VoucherType;
  operationNumber?: number;
  operationType?: OperationType;
  description: string;
  debit: number;   // مدين
  credit: number;  // دائن
  balance: number; // الرصيد
}

export type StatementFilter = 'all' | 'debit' | 'credit';
// all = الكل | debit = مدين على العميل | credit = دائن على المكتب
