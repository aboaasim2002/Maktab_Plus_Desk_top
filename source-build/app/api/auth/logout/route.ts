import { NextResponse } from 'next/server';
import { audit, deleteSession, getSessionUser } from '@/lib/auth';

export async function POST(request: Request) {
  const user = getSessionUser(request);
  const token = (request.headers.get('cookie') ?? '')
    .split(';').map((part) => part.trim())
    .find((part) => part.startsWith('office_session='))
    ?.split('=').slice(1).join('=');
  if (token) deleteSession(decodeURIComponent(token));
  if (user) audit(user.id, 'logout', 'session');
  const response = NextResponse.json({ success: true });
  response.cookies.set('office_session', '', { httpOnly: true, path: '/', maxAge: 0 });
  return response;
}

