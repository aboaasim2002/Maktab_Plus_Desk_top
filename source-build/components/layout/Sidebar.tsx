'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard, FileText, BarChart3, Building2, ChevronLeft,
  Settings, ReceiptText, ShieldCheck, ScrollText, LogOut, KeyRound,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import useOfficeSettings from '@/lib/useOfficeSettings';
import { useAuth } from '@/components/auth/AuthProvider';

const navItems = [
  { href: '/dashboard', label: 'لوحة التحكم', icon: LayoutDashboard, permission: 'dashboard.view' },
  { href: '/contracts', label: 'عملاء المكتب الدائمين', icon: FileText, permission: 'operations.view' },
  { href: '/invoices', label: 'الفواتير', icon: ReceiptText, permission: 'invoices.view' },
  { href: '/reports', label: 'التقارير', icon: BarChart3, permission: 'reports.view' },
  { href: '/users', label: 'المستخدمون والصلاحيات', icon: ShieldCheck, permission: 'users.manage' },
  { href: '/audit', label: 'سجل العمليات', icon: ScrollText, permission: 'audit.view' },
  { href: '/settings', label: 'بيانات المكتب', icon: Settings, permission: 'settings.view' },
];

export default function Sidebar() {
  const pathname = usePathname();
  const { officeName, officeAddress } = useOfficeSettings();
  const { user, can, logout } = useAuth();

  return (
    <aside className="fixed right-0 top-0 h-screen w-64 bg-white border-l border-gray-100 shadow-sm flex flex-col z-30 print-hidden">
      <div className="flex items-center gap-3 px-5 py-5 border-b border-gray-100">
        <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center flex-shrink-0">
          <Building2 className="w-5 h-5 text-white" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-bold text-gray-900 leading-tight truncate">{officeName}</p>
          <p className="text-xs text-gray-400 mt-0.5 truncate">{officeAddress || 'النظام المالي'}</p>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
        {navItems.filter((item) => can(item.permission)).map((item) => {
          const Icon = item.icon;
          const isActive = item.href === '/dashboard' ? pathname === '/dashboard' : pathname.startsWith(item.href);
          return (
            <Link key={item.href} href={item.href} className={cn(
              'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all group',
              isActive ? 'bg-indigo-50 text-indigo-700' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
            )}>
              <Icon className={cn('w-5 h-5 flex-shrink-0', isActive ? 'text-indigo-600' : 'text-gray-400 group-hover:text-gray-600')} />
              <span>{item.label}</span>
              {isActive && <ChevronLeft className="w-4 h-4 text-indigo-400 mr-auto" />}
            </Link>
          );
        })}
      </nav>

      <div className="px-4 py-4 border-t border-gray-100">
        <Link href="/profile" className="mb-2 flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-50">
          <KeyRound className="w-4 h-4 text-indigo-500" />
          حسابي وتغيير كلمة المرور
        </Link>
        <div className="flex items-center justify-between gap-2 mb-4 rounded-lg bg-gray-50 px-3 py-2">
          <div className="min-w-0">
            <p className="text-xs font-bold text-gray-800 truncate">{user?.arabic_name}</p>
            <p className="text-[11px] text-gray-400" dir="ltr">@{user?.username}</p>
          </div>
          <button onClick={logout} className="p-2 rounded-lg text-red-500 hover:bg-red-50" title="تسجيل الخروج">
            <LogOut className="w-4 h-4" />
          </button>
        </div>
        <div className="text-center text-[10px] text-gray-400 space-y-1">
          <p>© {new Date().getFullYear()} جميع الحقوق محفوظة</p>
          <p>برمجة وتصميم: أحمد محمد باريان</p>
        </div>
      </div>
    </aside>
  );
}
