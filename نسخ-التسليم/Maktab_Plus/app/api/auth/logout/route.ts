import { NextResponse } from 'next/server';
import { audit, deleteSession, getSessionUser } from '@/lib/auth';

export async function POST(request: Request) {
  const user = await getSessionUser(request);
  const token = (request.headers.get('cookie') ?? '')
    .split(';').map((part) => part.trim())
    .find((part) => part.startsWith('office_session='))
    ?.split('=').slice(1).join('=');
  if (token) await deleteSession(decodeURIComponent(token));
  if (user) await audit(user, 'logout', 'session');
  const response = NextResponse.json({ success: true });
  response.cookies.set('office_session', '', {
    httpOnly: true,
    secure: process.env.COOKIE_SECURE === '1',
    sameSite: 'strict',
    path: '/',
    maxAge: 0,
  });
  response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  response.headers.set('Clear-Site-Data', '"cache"');
  return response;
}
