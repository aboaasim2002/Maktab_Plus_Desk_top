import { NextResponse } from 'next/server';
import { one } from '@/lib/postgres';
import { audit, createSession, normalizeUsername, verifyPassword } from '@/lib/auth';

export async function POST(request: Request) {
  const body = await request.json();
  const username = normalizeUsername(body.username);
  const password = String(body.password ?? '');
  const user = await one<{
    id: string;
    organization_id: string | null;
    password_hash: string;
    is_active: boolean;
    role: 'platform_owner' | 'office_owner' | 'user';
    organization_active: boolean | null;
    subscription_status: string | null;
    subscription_ends_at: string | null;
  }>(`
    SELECT u.id, u.organization_id, u.password_hash, u.is_active, u.role,
      o.is_active AS organization_active, o.subscription_status, o.subscription_ends_at
    FROM users u
    LEFT JOIN organizations o ON o.id = u.organization_id
    WHERE lower(u.username) = lower($1)
  `, [username]);

  if (!user || !user.is_active || !verifyPassword(password, user.password_hash)) {
    return NextResponse.json(
      { error: 'اسم المستخدم أو كلمة المرور غير صحيحة، أو أن المستخدم موقوف' },
      { status: 401 }
    );
  }

  if (user.role !== 'platform_owner') {
    const subscriptionValid = user.organization_active
      && ['trial', 'active'].includes(String(user.subscription_status))
      && (!user.subscription_ends_at || new Date(user.subscription_ends_at).getTime() >= Date.now());
    if (!subscriptionValid) {
      return NextResponse.json(
        { error: 'اشتراك المنشأة غير نشط. تواصل مع مالك البرنامج لتجديد الاشتراك.' },
        { status: 403 }
      );
    }
  }

  const session = await createSession(user.id);
  await audit({ id: user.id, organization_id: user.organization_id }, 'login', 'session', null, { username });
  const response = NextResponse.json({ success: true, role: user.role });
  response.cookies.set('office_session', session.token, {
    httpOnly: true,
    secure: process.env.COOKIE_SECURE === '1',
    sameSite: 'strict',
    path: '/',
    expires: session.expiresAt,
  });
  return response;
}
