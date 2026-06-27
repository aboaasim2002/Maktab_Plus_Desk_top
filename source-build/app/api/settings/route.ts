import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/sqlite';
import { defaultOfficeSettings } from '@/lib/office-settings';
import { authorize } from '@/lib/api-auth';
import { audit } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const auth = authorize(request);
  if (auth.error) return auth.error;
  const db = getDb();
  const rows = db.prepare('SELECT key, value FROM settings').all() as Array<{
    key: string;
    value: string;
  }>;
  const values = Object.fromEntries(rows.map((row) => [row.key, row.value]));

  return NextResponse.json({
    officeName: values.officeName || defaultOfficeSettings.officeName,
    officeAddress: values.officeAddress || '',
  });
}

export async function PUT(request: NextRequest) {
  const auth = authorize(request, 'settings.edit');
  if (auth.error) return auth.error;
  const body = await request.json();
  const officeName = String(body.officeName ?? '').trim();
  const officeAddress = String(body.officeAddress ?? '').trim();

  if (!officeName) {
    return NextResponse.json({ error: 'اسم المكتب مطلوب' }, { status: 400 });
  }

  const db = getDb();
  const statement = db.prepare(`
    INSERT INTO settings (key, value, updated_at)
    VALUES (?, ?, datetime('now','localtime'))
    ON CONFLICT(key) DO UPDATE SET
      value = excluded.value,
      updated_at = excluded.updated_at
  `);

  db.exec('BEGIN');
  try {
    statement.run('officeName', officeName);
    statement.run('officeAddress', officeAddress);
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }

  audit(auth.user.id, 'update', 'settings', 'office', { officeName, officeAddress });
  return NextResponse.json({ officeName, officeAddress });
}
