import type { Metadata } from 'next';
import './globals.css';
import AuthProvider from '@/components/auth/AuthProvider';
import EnglishDateInputs from '@/components/layout/EnglishDateInputs';

export const metadata: Metadata = {
  title: 'مكتب بلس',
  description: 'نظام إدارة العقود والسندات المالية لمكتب الخدمات العامة',
  icons: { icon: '/maktab-plus-logo.png' },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ar" dir="rtl">
      <body className="bg-slate-50 text-gray-900 antialiased">
        <EnglishDateInputs />
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
