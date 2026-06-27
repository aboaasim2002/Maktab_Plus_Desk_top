export const PERMISSION_GROUPS = [
  {
    label: 'نطاق عرض البيانات',
    permissions: [
      { key: 'scope.own_only', label: 'عرض عملياته وبياناته هو فقط' },
    ],
  },
  {
    label: 'لوحة التحكم',
    permissions: [{ key: 'dashboard.view', label: 'عرض لوحة التحكم' }],
  },
  {
    label: 'العملاء',
    permissions: [
      { key: 'clients.view', label: 'عرض العملاء' },
      { key: 'clients.create', label: 'إضافة عميل' },
      { key: 'clients.edit', label: 'تعديل عميل' },
      { key: 'clients.delete', label: 'حذف عميل' },
    ],
  },
  {
    label: 'العمليات والسندات',
    permissions: [
      { key: 'operations.view', label: 'عرض العمليات' },
      { key: 'operations.create', label: 'إضافة عملية' },
      { key: 'operations.edit', label: 'تعديل عملية' },
      { key: 'operations.delete', label: 'حذف عملية' },
      { key: 'operations.print', label: 'طباعة عملية' },
      { key: 'vouchers.create', label: 'إصدار سند' },
      { key: 'vouchers.edit', label: 'تعديل سند' },
      { key: 'vouchers.delete', label: 'حذف سند' },
      { key: 'vouchers.print', label: 'طباعة سند قبض أو صرف' },
      { key: 'statements.view', label: 'عرض وطباعة كشف حساب العميل' },
    ],
  },
  {
    label: 'الفواتير',
    permissions: [
      { key: 'invoices.view', label: 'عرض الفواتير' },
      { key: 'invoices.create', label: 'إنشاء فاتورة' },
      { key: 'invoices.edit', label: 'تعديل فاتورة' },
      { key: 'invoices.delete', label: 'حذف فاتورة' },
      { key: 'invoices.print', label: 'طباعة فاتورة' },
      { key: 'invoices.reports', label: 'تقارير الفواتير' },
      { key: 'services.manage', label: 'إدارة قائمة الخدمات' },
    ],
  },
  {
    label: 'التقارير والإعدادات',
    permissions: [
      { key: 'reports.view', label: 'عرض التقارير وكشوف الحساب' },
      { key: 'settings.view', label: 'عرض بيانات المكتب' },
      { key: 'settings.edit', label: 'تعديل بيانات المكتب' },
      { key: 'users.manage', label: 'إدارة المستخدمين والصلاحيات' },
      { key: 'audit.view', label: 'عرض سجل العمليات' },
    ],
  },
] as const;

export type Permission = typeof PERMISSION_GROUPS[number]['permissions'][number]['key'];
export const ALL_PERMISSIONS = PERMISSION_GROUPS.flatMap((group) =>
  group.permissions.map((permission) => permission.key)
);
