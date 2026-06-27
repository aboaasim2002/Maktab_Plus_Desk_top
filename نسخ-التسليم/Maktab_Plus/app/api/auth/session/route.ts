import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';

export async function GET(request: Request) {
  const user = await getSessionUser(request);
  const response = user
    ? NextResponse.json({ user })
    : NextResponse.json({ error: 'لا توجد جلسة صالحة' }, { status: 401 });
  response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  return response;
}
