import { NextRequest, NextResponse } from 'next/server';

export function middleware(request: NextRequest) {
  const host = request.headers.get('x-forwarded-host') || request.headers.get('host');
  const protocol = request.headers.get('x-forwarded-proto') || request.nextUrl.protocol.replace(':', '');
  if (host) return NextResponse.redirect(`${protocol}://${host}/login`);
  return NextResponse.redirect(new URL('/login', request.url));
}

export const config = {
  matcher: ['/'],
};
