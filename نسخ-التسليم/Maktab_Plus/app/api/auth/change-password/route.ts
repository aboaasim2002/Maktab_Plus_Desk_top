import { NextResponse } from 'next/server';
import { authorize } from '@/lib/api-auth';
import { audit, hashPassword, verifyPassword } from '@/lib/auth';
import { execute, one } from '@/lib/postgres';

export async function POST(request: Request) {
  const auth = await authorize(request);
  if (auth.error) return auth.error;
  const body = await request.json();
  const currentPassword = String(body.currentPassword ?? body.current_password ?? '');
  const newPassword = String(body.newPassword ?? body.new_password ?? '');
  if (newPassword.length < 8) {
    return NextResponse.json({ error: 'كلمة المرور الجديدة يجب ألا تقل عن 8 أحرف' }, { status: 400 });
  }
  const row = await one<{ password_hash: string }>(
    'SELECT password_hash FROM users WHERE id = $1',
    [auth.user.id]
  );
  if (!row || !verifyPassword(currentPassword, row.password_hash)) {
    return NextResponse.json({ error: 'كلمة المرور الحالية غير صحيحة' }, { status: 400 });
  }
  await execute(
    'UPDATE users SET password_hash = $1, updated_at = now() WHERE id = $2',
    [hashPassword(newPassword), auth.user.id]
  );
  await audit(auth.user, 'change_password', 'user', auth.user.id);
  return NextResponse.json({ success: true });
}
