import { NextRequest, NextResponse } from 'next/server';
import { authorize, requireOrganization } from '@/lib/api-auth';
import { audit } from '@/lib/auth';
import { query, transaction } from '@/lib/postgres';
import { defaultOfficeSettings } from '@/lib/office-settings';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const auth = await authorize(request);
  if (auth.error) return auth.error;
  const organizationId = requireOrganization(auth.user);
  const rows = await query<{ key: string; value: string }>(
    'SELECT key, value FROM settings WHERE organization_id=$1',
    [organizationId]
  );
  const values = Object.fromEntries(rows.map((row) => [row.key, row.value]));
  return NextResponse.json({
    officeName: values.officeName || auth.user.organization_name || defaultOfficeSettings.officeName,
    officeAddress: values.officeAddress || '',
  });
}

export async function PUT(request: NextRequest) {
  const auth = await authorize(request, 'settings.edit');
  if (auth.error) return auth.error;
  const organizationId = requireOrganization(auth.user);
  const body = await request.json();
  const officeName = String(body.officeName ?? '').trim();
  const officeAddress = String(body.officeAddress ?? '').trim();
  if (!officeName) return NextResponse.json({ error: 'اسم المكتب مطلوب' }, { status: 400 });
  await transaction(async (client) => {
    for (const [key, value] of [['officeName', officeName], ['officeAddress', officeAddress]]) {
      await client.query(`
        INSERT INTO settings (organization_id, key, value)
        VALUES ($1,$2,$3)
        ON CONFLICT (organization_id, key)
        DO UPDATE SET value=excluded.value, updated_at=now()
      `, [organizationId, key, value]);
    }
    await client.query('UPDATE organizations SET name=$1, address=$2, updated_at=now() WHERE id=$3', [
      officeName, officeAddress || null, organizationId,
    ]);
  });
  await audit(auth.user, 'update', 'settings', 'office', { officeName, officeAddress });
  return NextResponse.json({ officeName, officeAddress });
}
