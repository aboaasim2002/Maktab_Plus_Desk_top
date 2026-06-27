'use client';

import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Building2, ChevronLeft, KeyRound, LogIn, Plus, RefreshCw,
  Users, FileText, ReceiptText, UserRound, Search, DatabaseBackup, Trash2, Edit2, DatabaseZap,
} from 'lucide-react';
import { useAuth } from '@/components/auth/AuthProvider';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import Modal from '@/components/ui/Modal';

interface Organization {
  id: string;
  customer_number: number;
  name: string;
  slug: string;
  phone: string | null;
  address: string | null;
  subscription_status: string;
  subscription_ends_at: string | null;
  is_active: boolean;
  owner_name: string;
  owner_username: string;
  users_count: number;
}

interface OrganizationUser {
  id: string;
  arabic_name: string;
  username: string;
  role: 'office_owner' | 'user';
  permission_mode: 'all' | 'custom';
  is_active: boolean;
}

interface OrganizationDetail {
  organization: Organization & {
    clients_count: number;
    contracts_count: number;
    invoices_count: number;
  };
  users: OrganizationUser[];
}

const emptyForm = {
  name: '', phone: '', address: '', owner_name: '',
  owner_username: '', owner_password: '', subscription_ends_at: '',
};

const emptyEditForm = {
  name: '',
  phone: '',
  address: '',
  owner_name: '',
  owner_username: '',
  owner_password: '',
  subscription_status: 'active',
  subscription_ends_at: '',
  is_active: true,
};

export default function OrganizationsPage() {
  const router = useRouter();
  const { user, loading, logout, refresh } = useAuth();
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [detail, setDetail] = useState<OrganizationDetail | null>(null);
  const [busy, setBusy] = useState(true);
  const [open, setOpen] = useState(false);
  const [resetUser, setResetUser] = useState<OrganizationUser | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [search, setSearch] = useState('');
  const [deleteOrganization, setDeleteOrganization] = useState<Organization | null>(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [nextCustomerNumber, setNextCustomerNumber] = useState(1001);
  const [creating, setCreating] = useState(false);
  const [editingOrganization, setEditingOrganization] = useState<Organization | null>(null);
  const [editForm, setEditForm] = useState(emptyEditForm);
  const [updating, setUpdating] = useState(false);
  const [restoring, setRestoring] = useState(false);

  const filteredOrganizations = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('ar');
    if (!term) return organizations;
    return organizations.filter((organization) => [
      organization.name,
      organization.customer_number,
      organization.slug,
      organization.phone,
      organization.address,
      organization.owner_name,
      organization.owner_username,
      organization.subscription_status,
    ].some((value) => String(value ?? '').toLocaleLowerCase('ar').includes(term)));
  }, [organizations, search]);

  const load = useCallback(async () => {
    setBusy(true);
    const response = await fetch('/api/organizations', { cache: 'no-store' });
    const data = response.ok ? await response.json() as Organization[] : [];
    const nextNumber = Number(response.headers.get('X-Next-Customer-Number'));
    if (Number.isSafeInteger(nextNumber) && nextNumber >= 1001) {
      setNextCustomerNumber(nextNumber);
    }
    setOrganizations(data);
    setSelectedId((current) => current || data[0]?.id || '');
    setBusy(false);
  }, []);

  const loadDetail = useCallback(async (id: string) => {
    if (!id) return setDetail(null);
    const response = await fetch(`/api/organizations/${id}`, { cache: 'no-store' });
    setDetail(response.ok ? await response.json() : null);
  }, []);

  useEffect(() => {
    if (user?.role === 'platform_owner') load();
  }, [load, user]);
  useEffect(() => { loadDetail(selectedId); }, [loadDetail, selectedId]);

  async function create(event: FormEvent) {
    event.preventDefault();
    if (creating) return;
    setCreating(true);
    setError('');
    setMessage('');
    try {
      const response = await fetch('/api/organizations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        return setError(data?.error || 'تعذر حفظ المنشأة. حاول مرة أخرى.');
      }
      if (!data?.id) {
        return setError('تم استلام رد غير صالح من الخادم. حدّث الصفحة وتحقق من قائمة المنشآت.');
      }

      setOpen(false);
      setForm(emptyForm);
      setSelectedId(data.id);
      setMessage(`تم إنشاء المنشأة «${form.name.trim()}» برقم العميل ${data.customer_number} بنجاح.`);
      await load();
      await loadDetail(data.id);
    } catch {
      setError('تعذر الاتصال بالخادم. تحقق من الشبكة ثم حاول مرة أخرى.');
    } finally {
      setCreating(false);
    }
  }

  async function permanentlyDeleteOrganization(event: FormEvent) {
    event.preventDefault();
    if (!deleteOrganization) return;
    if (deleteConfirmation.trim() !== String(deleteOrganization.customer_number)) {
      return setError('اكتب رقم معرف العميل كما هو لتأكيد الحذف النهائي.');
    }

    setDeleting(true);
    setError('');
    try {
      const response = await fetch(`/api/organizations/${deleteOrganization.id}`, {
        method: 'DELETE',
      });
      const data = await response.json();
      if (!response.ok) return setError(data.error || 'تعذر حذف المنشأة');

      const deletedId = deleteOrganization.id;
      setDeleteOrganization(null);
      setDeleteConfirmation('');
      setDetail(null);
      setSelectedId('');
      setMessage(`تم حذف المنشأة رقم ${deleteOrganization.customer_number} وجميع بياناتها نهائيًا.`);
      const remaining = organizations.filter((organization) => organization.id !== deletedId);
      setOrganizations(remaining);
      setSelectedId(remaining[0]?.id || '');
      await load();
    } finally {
      setDeleting(false);
    }
  }

  function openOrganizationEditor() {
    if (!detail) return;
    const owner = detail.users.find((organizationUser) => organizationUser.role === 'office_owner');
    setEditingOrganization(detail.organization);
    setEditForm({
      name: detail.organization.name,
      phone: detail.organization.phone || '',
      address: detail.organization.address || '',
      owner_name: owner?.arabic_name || detail.organization.owner_name || '',
      owner_username: owner?.username || detail.organization.owner_username || '',
      owner_password: '',
      subscription_status: detail.organization.subscription_status || 'active',
      subscription_ends_at: detail.organization.subscription_ends_at?.split('T')[0] || '',
      is_active: detail.organization.is_active,
    });
    setError('');
  }

  async function updateOrganization(event: FormEvent) {
    event.preventDefault();
    if (!editingOrganization) return;
    setUpdating(true);
    setError('');
    try {
      const response = await fetch(`/api/organizations/${editingOrganization.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editForm),
      });
      const data = await response.json();
      if (!response.ok) return setError(data.error || 'تعذر تعديل بيانات المنشأة');

      const updatedId = editingOrganization.id;
      setEditingOrganization(null);
      setMessage(`تم تحديث بيانات المنشأة رقم ${editingOrganization.customer_number} بنجاح.`);
      await load();
      await loadDetail(updatedId);
    } finally {
      setUpdating(false);
    }
  }

  async function enterOrganization() {
    if (!selectedId) return;
    const response = await fetch('/api/organizations/context', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ organization_id: selectedId }),
    });
    if (!response.ok) {
      const data = await response.json();
      return setMessage(data.error);
    }
    await refresh();
    router.push('/dashboard');
    router.refresh();
  }

  async function resetPassword(event: FormEvent) {
    event.preventDefault();
    if (!resetUser || !selectedId) return;
    const response = await fetch(
      `/api/organizations/${selectedId}/users/${resetUser.id}/password`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: newPassword }),
      }
    );
    const data = await response.json();
    if (!response.ok) return setError(data.error);
    setResetUser(null);
    setNewPassword('');
    setError('');
    setMessage(`تم تعيين كلمة مرور جديدة للمستخدم ${resetUser.arabic_name}`);
  }

  async function downloadFullBackup() {
    setMessage('جارٍ إنشاء النسخة الكاملة...');
    const response = await fetch('/api/database/full-backup');
    if (!response.ok) {
      const data = await response.json().catch(() => ({ error: 'تعذر إنشاء النسخة الكاملة' }));
      return setMessage(data.error);
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `maktab-plus-full-${new Date().toISOString().slice(0, 10)}.sql`;
    link.click();
    URL.revokeObjectURL(url);
    setMessage('تم تنزيل النسخة الكاملة لقاعدة البيانات');
  }

  async function restoreSelectedOrganization(file: File) {
    if (!detail) return;
    const confirmed = window.confirm(
      `تحذير: سيتم استبدال بيانات المنشأة «${detail.organization.name}» ببيانات النسخة الاحتياطية المحددة.\nهل تريد المتابعة؟`
    );
    if (!confirmed) return;

    setRestoring(true);
    setMessage('جارٍ استرداد بيانات المنشأة...');
    const formData = new FormData();
    formData.append('database', file);
    formData.append('organization_id', detail.organization.id);
    try {
      const response = await fetch('/api/database/import', { method: 'POST', body: formData });
      const result = await response.json();
      if (!response.ok) return setMessage(result.error || 'تعذر استرداد بيانات المنشأة');
      setMessage(`تم استرداد بيانات المنشأة رقم ${detail.organization.customer_number} بنجاح.`);
      await loadDetail(detail.organization.id);
    } finally {
      setRestoring(false);
    }
  }

  if (loading || busy) return <LoadingSpinner />;
  if (user?.role !== 'platform_owner') {
    return <div className="p-10">هذه الصفحة خاصة بمالك البرنامج.</div>;
  }

  return (
    <main className="min-h-screen bg-slate-50 p-4 sm:p-6" dir="rtl">
      <div className="max-w-7xl mx-auto">
        <header className="flex flex-wrap items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold">لوحة مالك المنصة</h1>
            <p className="text-gray-500 mt-1">إدارة المنشآت والاشتراكات والدخول الإداري</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={load} className="btn-secondary flex gap-2">
              <RefreshCw className="w-4 h-4" /> تحديث
            </button>
            <button onClick={() => setOpen(true)} className="btn-primary flex gap-2">
              <Plus className="w-4 h-4" /> منشأة جديدة
            </button>
            <button onClick={downloadFullBackup} className="btn-secondary flex gap-2">
              <DatabaseBackup className="w-4 h-4" /> نسخة كاملة SQL
            </button>
            <Link href="/profile" className="btn-secondary">تغيير كلمة مروري</Link>
            <button onClick={logout} className="btn-secondary">تسجيل الخروج</button>
          </div>
        </header>

        {message && (
          <div className="mb-4 rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm text-indigo-800">
            {message}
          </div>
        )}

        <div className="grid lg:grid-cols-[360px_1fr] gap-5 items-start">
          <aside className="card overflow-hidden lg:sticky lg:top-5">
            <div className="p-4 border-b bg-gray-50">
              <div className="font-bold mb-3">
                المنشآت ({filteredOrganizations.length}/{organizations.length})
              </div>
              <div className="relative">
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  className="input-field pr-9"
                  placeholder="ابحث بالاسم، الهاتف، المالك..."
                />
              </div>
            </div>
            <div className="max-h-[72vh] overflow-y-auto divide-y">
              {filteredOrganizations.map((organization) => (
                <button
                  key={organization.id}
                  onClick={() => setSelectedId(organization.id)}
                  className={`w-full text-right p-4 flex items-center gap-3 transition ${
                    selectedId === organization.id ? 'bg-indigo-50' : 'hover:bg-gray-50'
                  }`}
                >
                  <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center shrink-0">
                    <Building2 className="w-5 h-5 text-indigo-700" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-bold truncate">{organization.name}</p>
                    <p className="text-xs font-semibold text-indigo-700" dir="ltr">
                      رقم معرف العميل: {organization.customer_number}
                    </p>
                    <p className="text-xs text-gray-500 truncate">
                      @{organization.owner_username} · {organization.users_count} مستخدم
                    </p>
                    <p className={`text-xs mt-1 ${
                      organization.subscription_status === 'active' ? 'text-green-700' : 'text-red-600'
                    }`}>
                      {organization.subscription_status}
                    </p>
                  </div>
                  <ChevronLeft className="w-4 h-4 text-gray-400" />
                </button>
              ))}
              {!filteredOrganizations.length && (
                <p className="p-8 text-center text-gray-400">
                  {organizations.length ? 'لا توجد منشأة مطابقة للبحث' : 'لا توجد منشآت بعد'}
                </p>
              )}
            </div>
          </aside>

          <section className="space-y-5">
            {detail ? (
              <>
                <div className="card p-5">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <h2 className="text-xl font-bold">{detail.organization.name}</h2>
                      <p className="mt-1 text-sm font-bold text-indigo-700" dir="ltr">
                        رقم معرف العميل: {detail.organization.customer_number}
                      </p>
                      <p className="text-sm text-gray-500 mt-1">
                        {detail.organization.address || 'لا يوجد عنوان'} · {detail.organization.phone || 'لا يوجد هاتف'}
                      </p>
                      <p className="text-sm mt-2">
                        الاشتراك: <strong>{detail.organization.subscription_status}</strong>
                        {' · '}
                        ينتهي: {detail.organization.subscription_ends_at
                          ? new Date(detail.organization.subscription_ends_at).toLocaleDateString('en-GB')
                          : 'غير محدد'}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button onClick={enterOrganization} className="btn-primary flex items-center gap-2">
                        <LogIn className="w-4 h-4" />
                        الدخول إلى لوحة المنشأة
                      </button>
                      <button onClick={openOrganizationEditor} className="btn-secondary flex items-center gap-2">
                        <Edit2 className="w-4 h-4" />
                        تعديل بيانات المنشأة
                      </button>
                      <label className={`btn-secondary flex cursor-pointer items-center gap-2 ${restoring ? 'pointer-events-none opacity-60' : ''}`}>
                        <DatabaseZap className="w-4 h-4" />
                        {restoring ? 'جارٍ الاسترداد...' : 'استرداد بيانات المنشأة'}
                        <input
                          type="file"
                          accept=".sql,.db,.sqlite,.sqlite3,application/sql,application/vnd.sqlite3"
                          className="hidden"
                          disabled={restoring}
                          onChange={(event) => {
                            const file = event.target.files?.[0];
                            if (file) void restoreSelectedOrganization(file);
                            event.currentTarget.value = '';
                          }}
                        />
                      </label>
                      <button
                        onClick={() => {
                          setDeleteOrganization(detail.organization);
                          setDeleteConfirmation('');
                          setError('');
                        }}
                        className="inline-flex items-center gap-2 rounded-lg border border-red-300 bg-red-50 px-4 py-2 font-semibold text-red-700 hover:bg-red-100"
                      >
                        <Trash2 className="w-4 h-4" />
                        حذف المنشأة نهائيًا
                      </button>
                    </div>
                  </div>
                </div>

                <div className="grid sm:grid-cols-3 gap-4">
                  {[
                    { label: 'العملاء', value: detail.organization.clients_count, Icon: Users },
                    { label: 'العمليات', value: detail.organization.contracts_count, Icon: FileText },
                    { label: 'الفواتير', value: detail.organization.invoices_count, Icon: ReceiptText },
                  ].map(({ label, value, Icon }) => (
                    <div key={label} className="card p-4 flex items-center gap-3">
                      <Icon className="w-6 h-6 text-indigo-600" />
                      <div><p className="text-sm text-gray-500">{label}</p><p className="text-2xl font-bold">{value}</p></div>
                    </div>
                  ))}
                </div>

                <div className="card overflow-hidden">
                  <div className="px-5 py-4 border-b">
                    <h3 className="font-bold">مستخدمو المنشأة</h3>
                    <p className="text-sm text-gray-500 mt-1">
                      تستطيع إعادة تعيين كلمة مرور المالك أو أي موظف دون معرفة كلمته القديمة.
                    </p>
                  </div>
                  <div className="divide-y">
                    {detail.users.map((organizationUser) => (
                      <div key={organizationUser.id} className="p-4 flex flex-wrap items-center gap-3">
                        <UserRound className="w-5 h-5 text-gray-400" />
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold">{organizationUser.arabic_name}</p>
                          <p className="text-xs text-gray-500" dir="ltr">@{organizationUser.username}</p>
                        </div>
                        <span className="text-xs rounded-full bg-gray-100 px-3 py-1">
                          {organizationUser.role === 'office_owner' ? 'مالك المنشأة' : 'موظف'}
                        </span>
                        <button
                          onClick={() => { setResetUser(organizationUser); setError(''); }}
                          className="btn-secondary flex items-center gap-1"
                        >
                          <KeyRound className="w-4 h-4" /> كلمة مرور جديدة
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            ) : (
              <div className="card p-12 text-center text-gray-400">اختر منشأة لعرض تفاصيلها</div>
            )}
          </section>
        </div>
      </div>

      <Modal isOpen={open} onClose={() => setOpen(false)} title="إضافة منشأة ومالكها" size="lg">
        <form onSubmit={create} className="grid sm:grid-cols-2 gap-4">
          <label className="block">
            <span className="text-sm font-medium block mb-1">رقم معرف العميل</span>
            <input
              type="text"
              dir="ltr"
              className="input-field bg-gray-100 font-bold"
              value={nextCustomerNumber}
              readOnly
              required
            />
            <span className="mt-1 block text-xs text-gray-500">يُنشأ تلقائيًا ويكون فريدًا ولا يمكن تكراره.</span>
          </label>
          {[
            ['name', 'اسم المنشأة'],
            ['phone', 'الهاتف'], ['address', 'العنوان'],
            ['owner_name', 'اسم مالك المنشأة'], ['owner_username', 'اسم مستخدم المالك'],
            ['owner_password', 'كلمة مرور المالك'], ['subscription_ends_at', 'تاريخ نهاية الاشتراك'],
          ].map(([key, label]) => (
            <label key={key} className="block">
              <span className="text-sm font-medium block mb-1">{label}</span>
              <input
                type={key === 'owner_password' ? 'password' : key === 'subscription_ends_at' ? 'date' : 'text'}
                dir={key.includes('username') || key.includes('password') ? 'ltr' : undefined}
                className="input-field"
                value={form[key as keyof typeof form]}
                onChange={(event) => setForm((current) => ({ ...current, [key]: event.target.value }))}
                required={['name', 'owner_name', 'owner_username', 'owner_password'].includes(key)}
              />
            </label>
          ))}
          {error && <div className="sm:col-span-2 text-red-700 bg-red-50 p-3 rounded-lg">{error}</div>}
          <p className="sm:col-span-2 text-xs text-gray-500">
            اسم المستخدم يجب أن يكون بالإنجليزية من 3 إلى 30 حرفًا، وكلمة المرور 8 أحرف على الأقل.
          </p>
          <button disabled={creating} className="btn-primary sm:col-span-2 disabled:cursor-not-allowed disabled:opacity-60">
            {creating ? 'جارٍ حفظ المنشأة...' : 'إنشاء المنشأة'}
          </button>
        </form>
      </Modal>

      <Modal
        isOpen={Boolean(editingOrganization)}
        onClose={() => {
          if (updating) return;
          setEditingOrganization(null);
          setError('');
        }}
        title={`تعديل بيانات المنشأة رقم ${editingOrganization?.customer_number ?? ''}`}
        size="lg"
      >
        <form onSubmit={updateOrganization} className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-sm font-medium">رقم معرف العميل</span>
            <input
              className="input-field cursor-not-allowed bg-gray-100 font-bold text-gray-600"
              value={editingOrganization?.customer_number ?? ''}
              dir="ltr"
              readOnly
              disabled
            />
            <span className="mt-1 block text-xs text-gray-500">رقم ثابت لا يمكن تعديله.</span>
          </label>

          {[
            ['name', 'اسم المنشأة'],
            ['phone', 'الهاتف'],
            ['address', 'العنوان'],
            ['owner_name', 'اسم مالك المنشأة'],
            ['owner_username', 'اسم مستخدم المالك'],
            ['owner_password', 'كلمة مرور جديدة للمالك (اختياري)'],
            ['subscription_ends_at', 'تاريخ نهاية الاشتراك'],
          ].map(([key, label]) => (
            <label key={key} className="block">
              <span className="mb-1 block text-sm font-medium">{label}</span>
              <input
                type={key === 'owner_password' ? 'password' : key === 'subscription_ends_at' ? 'date' : 'text'}
                dir={key.includes('username') || key.includes('password') ? 'ltr' : undefined}
                className="input-field"
                minLength={key === 'owner_password' ? 8 : undefined}
                value={String(editForm[key as keyof typeof editForm])}
                onChange={(event) => setEditForm((current) => ({ ...current, [key]: event.target.value }))}
                required={['name', 'owner_name', 'owner_username'].includes(key)}
              />
            </label>
          ))}

          <label className="block">
            <span className="mb-1 block text-sm font-medium">حالة الاشتراك</span>
            <select
              className="input-field"
              value={editForm.subscription_status}
              onChange={(event) => setEditForm((current) => ({ ...current, subscription_status: event.target.value }))}
            >
              <option value="trial">تجريبي</option>
              <option value="active">نشط</option>
              <option value="past_due">متأخر السداد</option>
              <option value="suspended">موقوف</option>
              <option value="expired">منتهي</option>
              <option value="cancelled">ملغي</option>
            </select>
          </label>

          <label className="flex items-center gap-3 rounded-xl border border-gray-200 p-3 sm:col-span-2">
            <input
              type="checkbox"
              checked={editForm.is_active}
              onChange={(event) => setEditForm((current) => ({ ...current, is_active: event.target.checked }))}
              className="h-5 w-5"
            />
            <span className="font-medium">السماح للمنشأة ومستخدميها بالدخول إلى النظام</span>
          </label>

          {error && <div className="rounded-lg bg-red-50 p-3 text-red-700 sm:col-span-2">{error}</div>}
          <button type="submit" disabled={updating} className="btn-primary sm:col-span-2">
            {updating ? 'جارٍ حفظ التعديلات...' : 'حفظ تعديلات المنشأة'}
          </button>
        </form>
      </Modal>

      <Modal
        isOpen={Boolean(deleteOrganization)}
        onClose={() => {
          if (deleting) return;
          setDeleteOrganization(null);
          setDeleteConfirmation('');
          setError('');
        }}
        title="حذف المنشأة نهائيًا"
      >
        <form onSubmit={permanentlyDeleteOrganization} className="space-y-4">
          <div className="rounded-xl border border-red-300 bg-red-50 p-4 text-sm leading-7 text-red-800">
            <strong>تحذير نهائي:</strong> سيؤدي حذف المنشأة «{deleteOrganization?.name}» إلى حذف جميع
            مستخدميها وعملائها وعملياتها وسنداتها وفواتيرها وإعداداتها نهائيًا، ولا يمكن التراجع عن ذلك.
          </div>
          <label className="block">
            <span className="mb-1 block text-sm font-semibold">
              اكتب رقم معرف العميل ({deleteOrganization?.customer_number}) للتأكيد
            </span>
            <input
              type="text"
              inputMode="numeric"
              dir="ltr"
              className="input-field"
              value={deleteConfirmation}
              onChange={(event) => setDeleteConfirmation(event.target.value.replace(/\D/g, ''))}
              required
              autoComplete="off"
            />
          </label>
          {error && <div className="rounded-lg bg-red-50 p-3 text-red-700">{error}</div>}
          <button
            type="submit"
            disabled={deleting || deleteConfirmation !== String(deleteOrganization?.customer_number ?? '')}
            className="w-full rounded-lg bg-red-700 px-4 py-3 font-bold text-white hover:bg-red-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {deleting ? 'جارٍ الحذف النهائي...' : 'حذف المنشأة وجميع بياناتها نهائيًا'}
          </button>
        </form>
      </Modal>

      <Modal
        isOpen={Boolean(resetUser)}
        onClose={() => { setResetUser(null); setNewPassword(''); setError(''); }}
        title={`إعادة تعيين كلمة مرور ${resetUser?.arabic_name ?? ''}`}
      >
        <form onSubmit={resetPassword} className="space-y-4">
          <p className="text-sm text-gray-600">
            ستُلغى الحاجة لمعرفة كلمة المرور القديمة، وسيستطيع المستخدم الدخول بالكلمة الجديدة فورًا.
          </p>
          <input
            type="password"
            dir="ltr"
            minLength={8}
            required
            className="input-field"
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            placeholder="كلمة المرور الجديدة"
          />
          {error && <div className="text-red-700 bg-red-50 p-3 rounded-lg">{error}</div>}
          <button className="btn-primary w-full">حفظ كلمة المرور الجديدة</button>
        </form>
      </Modal>
    </main>
  );
}
