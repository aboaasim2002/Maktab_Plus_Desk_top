'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Edit2, Plus, Search, Trash2, UserCheck, UserX } from 'lucide-react';
import MainLayout from '@/components/layout/MainLayout';
import Modal from '@/components/ui/Modal';
import { PERMISSION_GROUPS } from '@/lib/permissions';

interface UserRow {
  id: string;
  arabic_name: string;
  username: string;
  role: 'admin' | 'user';
  permission_mode: 'all' | 'custom';
  is_active: boolean;
  permissions: string[];
}

const newUserForm = () => ({
  arabic_name: '',
  username: '',
  password: '',
  permission_mode: 'custom' as 'all' | 'custom',
  is_active: true,
  permissions: [] as string[],
});

export default function UsersPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<UserRow | null>(null);
  const [form, setForm] = useState(newUserForm());
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    setLoadingUsers(true);
    try {
      const response = await fetch(`/api/users?refresh=${Date.now()}`, {
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache' },
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'تعذر تحميل المستخدمين');
      setUsers(Array.isArray(data) ? data : []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'تعذر تحميل المستخدمين');
    } finally {
      setLoadingUsers(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  function openCreate() {
    setEditing(null);
    setForm(newUserForm());
    setError('');
    setMessage('');
    setShowForm(true);
  }

  function openEdit(user: UserRow) {
    setEditing(user);
    setForm({
      arabic_name: user.arabic_name,
      username: user.username,
      password: '',
      permission_mode: user.permission_mode,
      is_active: user.is_active,
      permissions: [...user.permissions],
    });
    setError('');
    setMessage('');
    setShowForm(true);
  }

  function togglePermission(permission: string) {
    setForm((current) => ({
      ...current,
      permissions: current.permissions.includes(permission)
        ? current.permissions.filter((item) => item !== permission)
        : [...current.permissions, permission],
    }));
  }

  async function save(event?: FormEvent) {
    event?.preventDefault();
    if (saving) return;
    setError('');
    setMessage('');

    if (!form.arabic_name.trim()) return setError('اسم الشخص بالعربي مطلوب');
    if (!/^[A-Za-z0-9._-]{3,30}$/.test(form.username)) {
      return setError('اسم المستخدم يجب أن يكون بالإنجليزية ومن 3 إلى 30 حرفًا');
    }
    if (!editing && form.password.length < 6) {
      return setError('كلمة المرور يجب ألا تقل عن 6 أحرف');
    }

    setSaving(true);
    try {
      const response = await fetch(editing ? `/api/users/${editing.id}` : '/api/users', {
        method: editing ? 'PUT' : 'POST',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' },
        body: JSON.stringify(form),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'تعذر حفظ المستخدم');

      if (editing) {
        setUsers((current) => current.map((user) =>
          user.id === editing.id
            ? {
                ...user,
                arabic_name: form.arabic_name.trim(),
                username: form.username.trim().toLowerCase(),
                permission_mode: editing.role === 'admin' ? 'all' : form.permission_mode,
                is_active: editing.role === 'admin' ? true : form.is_active,
                permissions: form.permission_mode === 'custom' ? [...form.permissions] : [],
              }
            : user
        ));
      } else {
        setUsers((current) => [
          data as UserRow,
          ...current.filter((user) => user.id !== data.id),
        ]);
      }

      setShowForm(false);
      setMessage(editing ? 'تم تحديث المستخدم بنجاح' : `تمت إضافة المستخدم ${data.arabic_name} بنجاح`);
      await load();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'تعذر حفظ المستخدم');
    } finally {
      setSaving(false);
    }
  }

  async function remove(user: UserRow) {
    if (!confirm(`هل تريد حذف المستخدم ${user.arabic_name}؟`)) return;
    const response = await fetch(`/api/users/${user.id}`, { method: 'DELETE', cache: 'no-store' });
    const data = await response.json();
    if (!response.ok) return setError(data.error || 'تعذر حذف المستخدم');
    setUsers((current) => current.filter((item) => item.id !== user.id));
    setMessage('تم حذف المستخدم بنجاح');
  }

  const normalizedSearch = search.trim().toLowerCase();
  const filteredUsers = users.filter((user) =>
    !normalizedSearch ||
    user.arabic_name.toLowerCase().includes(normalizedSearch) ||
    user.username.toLowerCase().includes(normalizedSearch)
  );

  return (
    <MainLayout
      title="المستخدمون والصلاحيات"
      subtitle="تحديد ما يستطيع كل مستخدم الوصول إليه"
      permission="users.manage"
      actions={
        <button onClick={openCreate} className="btn-primary flex items-center gap-1">
          <Plus className="w-4 h-4" /> مستخدم جديد
        </button>
      }
    >
      {message && (
        <div className="mb-5 flex items-center gap-2 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
          <CheckCircle2 className="w-5 h-5" /> {message}
        </div>
      )}
      {!showForm && error && (
        <div className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      <div className="card p-4 mb-5">
        <label className="relative block max-w-xl">
          <Search className="absolute right-3 top-3 w-5 h-5 text-gray-400" />
          <input
            className="input-field pr-10"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="ابحث بالاسم العربي أو اسم المستخدم الإنجليزي..."
          />
        </label>
      </div>

      {loadingUsers ? (
        <div className="card p-10 text-center text-gray-400">جارٍ تحميل المستخدمين...</div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm">
            <thead className="bg-gray-100 text-gray-700">
              <tr>
                <th className="px-4 py-3 text-right">الاسم بالعربي</th>
                <th className="px-4 py-3 text-right">اسم المستخدم</th>
                <th className="px-4 py-3 text-center">الحالة</th>
                <th className="px-4 py-3 text-center">الصلاحيات</th>
                <th className="px-4 py-3 text-center">الإجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredUsers.map((user) => (
                <tr key={user.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-semibold text-gray-900">{user.arabic_name}</td>
                  <td className="px-4 py-3 text-gray-500" dir="ltr">@{user.username}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`badge ${user.is_active ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                      {user.is_active ? <UserCheck className="w-3.5 h-3.5 ml-1" /> : <UserX className="w-3.5 h-3.5 ml-1" />}
                      {user.is_active ? 'نشط' : 'موقوف'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center text-gray-600">
                    {user.role === 'admin' || user.permission_mode === 'all'
                      ? 'كافة الصلاحيات'
                      : `${user.permissions.length} صلاحية محددة`}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-center gap-2">
                      <button onClick={() => openEdit(user)} className="btn-secondary flex items-center gap-1 px-3 py-1.5">
                        <Edit2 className="w-4 h-4" /> تعديل
                      </button>
                      {user.role !== 'admin' && (
                        <button onClick={() => remove(user)} className="btn-danger flex items-center gap-1 px-3 py-1.5">
                          <Trash2 className="w-4 h-4" /> حذف
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {filteredUsers.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-gray-400">
                    لا يوجد مستخدم مطابق للبحث
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <Modal isOpen={showForm} onClose={() => !saving && setShowForm(false)} title={editing ? 'تعديل المستخدم' : 'إضافة مستخدم'} size="lg">
        <form onSubmit={save} className="space-y-5">
          {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm">{error}</div>}
          <div className="grid md:grid-cols-2 gap-4">
            <label>
              <span className="block text-sm font-semibold mb-2">اسم الشخص بالعربي</span>
              <input className="input-field" value={form.arabic_name} onChange={(e) => setForm({ ...form, arabic_name: e.target.value })} required />
            </label>
            <label>
              <span className="block text-sm font-semibold mb-2">اسم المستخدم بالإنجليزي</span>
              <input
                dir="ltr"
                className="input-field text-left"
                value={form.username}
                onChange={(e) => setForm({ ...form, username: e.target.value.replace(/[^A-Za-z0-9._-]/g, '').toLowerCase() })}
                minLength={3}
                required
              />
            </label>
            <label>
              <span className="block text-sm font-semibold mb-2">
                كلمة المرور {editing && '(اتركها فارغة دون تغيير)'}
              </span>
              <input dir="ltr" type="password" className="input-field text-left" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} minLength={editing ? undefined : 6} required={!editing} />
            </label>
            <label>
              <span className="block text-sm font-semibold mb-2">نوع الصلاحية</span>
              <select className="input-field" value={form.permission_mode} disabled={editing?.role === 'admin'} onChange={(e) => setForm({ ...form, permission_mode: e.target.value as 'all' | 'custom' })}>
                <option value="all">كافة الصلاحيات</option>
                <option value="custom">صلاحيات محددة</option>
              </select>
            </label>
          </div>

          {editing?.role !== 'admin' && (
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} />
              المستخدم نشط ويستطيع تسجيل الدخول
            </label>
          )}

          {form.permission_mode === 'custom' && editing?.role !== 'admin' && (
            <div className="space-y-4 max-h-[45vh] overflow-y-auto border rounded-xl p-4">
              {PERMISSION_GROUPS.map((group) => (
                <div key={group.label}>
                  <h3 className="font-bold text-indigo-800 mb-2">{group.label}</h3>
                  <div className="grid md:grid-cols-2 gap-2">
                    {group.permissions.map((permission) => (
                      <label key={permission.key} className="flex items-center gap-2 rounded-lg border p-2 hover:bg-gray-50">
                        <input type="checkbox" checked={form.permissions.includes(permission.key)} onChange={() => togglePermission(permission.key)} />
                        <span className="text-sm">{permission.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          <button type="submit" disabled={saving} className="btn-primary w-full py-3">
            {saving ? 'جارٍ حفظ المستخدم...' : 'حفظ المستخدم والصلاحيات'}
          </button>
        </form>
      </Modal>
    </MainLayout>
  );
}
