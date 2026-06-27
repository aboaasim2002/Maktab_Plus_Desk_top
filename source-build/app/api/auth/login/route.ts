import { NextResponse } from 'next/server';
import { getDb } from '@/lib/sqlite';
import { audit, createSession, normalizeUsername, verifyPassword } from '@/lib/auth';

export async function POST(request: Request) {
  const body = await request.json();
  const username = normalizeUsername(body.username);
  const password = String(body.password ?? '');
  const user = getDb().prepare(`
    SELECT id, password_hash, is_active FROM users WHERE username = ? COLLATE NOCASE
  `).get(username) as { id: string; password_hash: string; is_active: number } | undefined;

  if (!user || !user.is_active || !verifyPassword(password, user.password_hash)) {
    return NextResponse.json({ error: 'اسم المستخدم أو كلمة المرور غير صحيحة، أو أن المستخدم موقوف' }, { status: 401 });
  }

  const session = createSession(user.id);
  audit(user.id, 'login', 'session', null, { username });
  const response = NextResponse.json({ success: true });
  response.cookies.set('office_session', session.token, {
    httpOnly: true,
    sameSite: 'strict',
    path: '/',
    expires: session.expiresAt,
  });
  return response;
}
