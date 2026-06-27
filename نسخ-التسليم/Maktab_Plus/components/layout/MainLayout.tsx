'use client';

import { useState } from 'react';
import { Menu, X } from 'lucide-react';
import Sidebar from './Sidebar';
import { useAuth } from '@/components/auth/AuthProvider';
import LoadingSpinner from '@/components/ui/LoadingSpinner';

interface MainLayoutProps {
  children: React.ReactNode;
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  permission?: string;
}

export default function MainLayout({ children, title, subtitle, actions, permission }: MainLayoutProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { loading, can } = useAuth();

  if (loading) return <div className="min-h-screen flex items-center justify-center"><LoadingSpinner /></div>;
  if (permission && !can(permission)) {
    return (
      <div className="min-h-screen bg-slate-50">
        <div className="hidden lg:block"><Sidebar /></div>
        <div className="lg:mr-64 min-h-screen flex items-center justify-center p-6">
          <div className="card p-10 text-center max-w-lg">
            <h1 className="text-xl font-bold text-gray-900">هذه الصفحة محجوبة</h1>
            <p className="text-gray-500 mt-2">ليس لديك الصلاحية اللازمة لعرض هذه الصفحة.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Sidebar — ثابت يظهر على الشاشات الكبيرة */}
      <div className="hidden lg:block print-hidden">
        <Sidebar />
      </div>

      {/* Mobile Overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
          />
          <div className="absolute right-0 top-0 h-full print-hidden">
            <Sidebar />
          </div>
        </div>
      )}

      {/* المنطقة الرئيسية */}
      <div className="lg:mr-64 min-h-screen flex flex-col">
        {/* شريط الرأس */}
        <header className="bg-white border-b border-gray-100 px-4 sm:px-6 py-4 flex items-center gap-4 print-hidden sticky top-0 z-20">
          {/* زر القائمة على الجوال */}
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="lg:hidden p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition"
          >
            {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>

          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold text-gray-900 truncate">{title}</h1>
            {subtitle && (
              <p className="text-sm text-gray-500 mt-0.5 truncate">{subtitle}</p>
            )}
          </div>

          {actions && <div className="flex items-center gap-2 flex-shrink-0">{actions}</div>}
        </header>

        {/* محتوى الصفحة */}
        <main className="flex-1 p-4 sm:p-6 fade-in">{children}</main>
      </div>
    </div>
  );
}
