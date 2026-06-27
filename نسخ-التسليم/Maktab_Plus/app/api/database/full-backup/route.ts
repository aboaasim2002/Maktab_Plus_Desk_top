import { spawn } from 'child_process';
import { Readable } from 'stream';
import { NextResponse } from 'next/server';
import { authorize } from '@/lib/api-auth';
import { audit } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const auth = await authorize(request);
  if (auth.error) return auth.error;
  if (auth.user.role !== 'platform_owner') {
    return NextResponse.json({ error: 'النسخة الكاملة خاصة بمالك المنصة' }, { status: 403 });
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    return NextResponse.json({ error: 'DATABASE_URL غير مضبوط' }, { status: 500 });
  }
  const connection = new URL(databaseUrl);
  const executable = process.env.PG_DUMP_PATH
    || (process.platform === 'win32'
      ? 'C:\\Program Files\\PostgreSQL\\18\\bin\\pg_dump.exe'
      : 'pg_dump');
  const child = spawn(executable, [
    '--host', connection.hostname,
    '--port', connection.port || '5432',
    '--username', decodeURIComponent(connection.username),
    '--dbname', connection.pathname.replace(/^\//, ''),
    '--format', 'plain',
    '--encoding', 'UTF8',
    '--no-owner',
    '--no-privileges',
  ], {
    env: {
      ...process.env,
      PGPASSWORD: decodeURIComponent(connection.password),
    },
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let stderr = '';
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  const started = await new Promise<boolean>((resolve) => {
    child.once('spawn', () => resolve(true));
    child.once('error', () => resolve(false));
  });
  if (!started || !child.stdout) {
    return NextResponse.json({
      error: `تعذر تشغيل pg_dump${stderr ? `: ${stderr}` : ''}`,
    }, { status: 500 });
  }

  await audit(auth.user, 'full_backup', 'database');
  const date = new Date().toISOString().slice(0, 10);
  return new Response(Readable.toWeb(child.stdout) as ReadableStream, {
    headers: {
      'Content-Type': 'application/sql; charset=utf-8',
      'Content-Disposition': `attachment; filename="maktab-plus-full-${date}.sql"`,
      'Cache-Control': 'no-store',
    },
  });
}
