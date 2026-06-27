import fs from 'fs';
import os from 'os';
import path from 'path';
import { randomUUID } from 'crypto';
import { authorize } from '@/lib/api-auth';
import { audit } from '@/lib/auth';
import {
  importLegacySqlite,
  parseSignedOrganizationSql,
  restoreOrganizationBackup,
} from '@/lib/database-transfer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const MAX_DATABASE_SIZE = 100 * 1024 * 1024;

export async function POST(request: Request) {
  const auth = await authorize(request);
  if (auth.error) return auth.error;
  if (auth.user.role !== 'platform_owner') {
    return Response.json({ error: 'استرداد البيانات متاح لمالك المنصة فقط' }, { status: 403 });
  }
  const formData = await request.formData();
  const organizationId = String(formData.get('organization_id') ?? auth.user.organization_id ?? '').trim();
  if (!organizationId) {
    return Response.json({ error: 'اختر المنشأة المطلوب استرداد بياناتها' }, { status: 400 });
  }
  const file = formData.get('database');
  if (!(file instanceof File) || file.size === 0 || file.size > MAX_DATABASE_SIZE) {
    return Response.json({ error: 'اختر ملف SQL أو SQLite صالحًا لا يتجاوز 100 ميجابايت' }, { status: 400 });
  }
  if (file.name.toLowerCase().endsWith('.sql') || file.type.includes('sql')) {
    try {
      const result = await restoreOrganizationBackup(
        parseSignedOrganizationSql(await file.text()),
        organizationId
      );
      await audit(auth.user, 'restore', 'database', null, result.counts);
      return Response.json({
        success: true,
        restored: true,
        counts: {
          ...result.counts,
          operations: result.counts.contracts,
        },
        duplicateClients: [],
      });
    } catch (error) {
      return Response.json({
        error: error instanceof Error ? error.message : 'تعذر استرداد النسخة الاحتياطية',
      }, { status: 400 });
    }
  }

  const tempPath = path.join(os.tmpdir(), `maktab-plus-import-${randomUUID()}.db`);
  try {
    fs.writeFileSync(tempPath, new Uint8Array(await file.arrayBuffer()), { flag: 'wx' });
    const result = await importLegacySqlite(tempPath, organizationId, auth.user.id);
    await audit(auth.user, 'import', 'database', null, result.counts);
    return Response.json({ success: true, ...result });
  } catch (error) {
    return Response.json({
      error: error instanceof Error ? error.message : 'تعذر استيراد قاعدة البيانات',
    }, { status: 400 });
  } finally {
    try { fs.unlinkSync(tempPath); } catch {}
  }
}
