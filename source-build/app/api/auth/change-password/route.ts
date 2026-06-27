import { NextResponse } from 'next/server';
import { authorize } from '@/lib/api-auth';
import { audit, hashPassword, verifyPassword } from '@/lib/auth';
import { getDb } from '@/lib/sqlite';

export async function POST(request: Request) {
  const auth = authorize(request);
  if (auth.error) return auth.error;

  const body = await request.json();
  const currentPassword = String(body.current_password ?? '');
  const newPassword = String(body.new_password ?? '');
  const confirmation = String(body.confirm_password ?? '');

  if (newPassword.length < 6) {
    return NextResponse.json({ error: 'كلمة المرور الجديدة يجب ألا تقل عن 6 أحرف' }, { status: 400 });
  }
  if (newPassword !== confirmation) {
    return NextResponse.json({ error: 'تأكيد كلمة المرور الجديدة غير مطابق' }, { status: 400 });
  }
  if (currentPassword === newPassword) {
    return NextResponse.json({ error: 'اختر كلمة مرور جديدة مختلفة عن الحالية' }, { status: 400 });
  }

  const db = getDb();
  const row = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(auth.user.id) as
    { password_hash: string } | undefined;
  if (!row || !verifyPassword(currentPassword, row.password_hash)) {
    return NextResponse.json({ error: 'كلمة المرور الحالية غير صحيحة' }, { status: 401 });
  }

  db.prepare(`
    UPDATE users SET password_hash = ?, updated_at = datetime('now','localtime') WHERE id = ?
  `).run(hashPassword(newPassword), auth.user.id);
  audit(auth.user.id, 'change_password', 'user', auth.user.id);
  return NextResponse.json({ success: true });
}

