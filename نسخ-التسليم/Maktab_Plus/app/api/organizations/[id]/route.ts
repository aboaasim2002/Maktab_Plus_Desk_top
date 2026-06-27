import { NextResponse } from 'next/server';
import { authorize } from '@/lib/api-auth';
import { audit, hashPassword, normalizeUsername } from '@/lib/auth';
import { one, query, transaction } from '@/lib/postgres';
import { refreshAccessSignature } from '@/lib/access-integrity';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorize(request);
  if (auth.error) return auth.error;
  if (auth.user.role !== 'platform_owner') {
    return NextResponse.json({ error: 'هذه العملية خاصة بمالك البرنامج' }, { status: 403 });
  }
  const { id } = await params;
  const organization = await one(`
    SELECT o.*,
      (SELECT count(*)::int FROM clients WHERE organization_id=o.id) AS clients_count,
      (SELECT count(*)::int FROM contracts WHERE organization_id=o.id) AS contracts_count,
      (SELECT count(*)::int FROM invoices WHERE organization_id=o.id) AS invoices_count
    FROM organizations o WHERE o.id=$1
  `, [id]);
  if (!organization) return NextResponse.json({ error: 'المنشأة غير موجودة' }, { status: 404 });
  const users = await query(`
    SELECT id, arabic_name, username, role, permission_mode, is_active, created_at
    FROM users WHERE organization_id=$1
    ORDER BY CASE role WHEN 'office_owner' THEN 0 ELSE 1 END, arabic_name
  `, [id]);
  return NextResponse.json({ organization, users });
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorize(request);
  if (auth.error) return auth.error;
  if (auth.user.role !== 'platform_owner') {
    return NextResponse.json({ error: 'هذه العملية خاصة بمالك البرنامج' }, { status: 403 });
  }
  const { id } = await params;
  const body = await request.json();
  const name = String(body.name ?? '').trim();
  const ownerName = String(body.owner_name ?? '').trim();
  const ownerUsername = normalizeUsername(body.owner_username);
  const ownerPassword = String(body.owner_password ?? '');
  if (!name || !ownerName || !/^[A-Za-z0-9._-]{3,30}$/.test(ownerUsername)) {
    return NextResponse.json({ error: 'أكمل اسم المنشأة وبيانات مالكها بصورة صحيحة' }, { status: 400 });
  }
  if (ownerPassword && ownerPassword.length < 8) {
    return NextResponse.json({ error: 'كلمة المرور الجديدة يجب ألا تقل عن 8 أحرف' }, { status: 400 });
  }
  const duplicateUsername = await one(`
    SELECT 1 FROM users
    WHERE lower(username)=lower($1)
      AND NOT (organization_id=$2 AND role='office_owner')
  `, [ownerUsername, id]);
  if (duplicateUsername) {
    return NextResponse.json({ error: 'اسم مستخدم مالك المنشأة مستخدم مسبقًا' }, { status: 409 });
  }

  await transaction(async (client) => {
    const updatedOrganization = await client.query(`
      UPDATE organizations SET name=$1, phone=$2, address=$3,
        subscription_status=$4, subscription_ends_at=$5, is_active=$6, updated_at=now()
      WHERE id=$7
      RETURNING id
    `, [
      name,
      body.phone || null,
      body.address || null,
      body.subscription_status || 'active',
      body.subscription_ends_at || null,
      body.is_active !== false,
      id,
    ]);
    if (!updatedOrganization.rows[0]) throw new Error('ORGANIZATION_NOT_FOUND');
    await client.query(`
      INSERT INTO settings (organization_id, key, value)
      VALUES ($1, 'officeName', $2), ($1, 'officeAddress', $3)
      ON CONFLICT (organization_id, key)
      DO UPDATE SET value=EXCLUDED.value, updated_at=now()
    `, [id, name, body.address || '']);
    if (ownerUsername) {
      let ownerId: string | undefined;
      if (ownerPassword) {
        const owner = await client.query<{ id: string }>(`
          UPDATE users SET arabic_name=$1, username=$2, password_hash=$3, updated_at=now()
          WHERE organization_id=$4 AND role='office_owner'
          RETURNING id
        `, [
          ownerName,
          ownerUsername,
          hashPassword(ownerPassword),
          id,
        ]);
        ownerId = owner.rows[0]?.id;
      } else {
        const owner = await client.query<{ id: string }>(`
          UPDATE users SET arabic_name=$1, username=$2, updated_at=now()
          WHERE organization_id=$3 AND role='office_owner'
          RETURNING id
        `, [ownerName, ownerUsername, id]);
        ownerId = owner.rows[0]?.id;
      }
      if (ownerId) await refreshAccessSignature(client, ownerId);
    }
  });
  await audit(auth.user, 'update', 'organization', id, {
    status: body.subscription_status,
    endsAt: body.subscription_ends_at,
  });
  return NextResponse.json({ success: true });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorize(request);
  if (auth.error) return auth.error;
  if (auth.user.role !== 'platform_owner') {
    return NextResponse.json({ error: 'هذه العملية خاصة بمالك البرنامج' }, { status: 403 });
  }
  const { id } = await params;
  const organization = await one<{ name: string; customer_number: number }>(`
    SELECT name, customer_number FROM organizations WHERE id=$1
  `, [id]);
  if (!organization) return NextResponse.json({ error: 'المنشأة غير موجودة' }, { status: 404 });

  await transaction(async (client) => {
    await client.query('DELETE FROM organizations WHERE id=$1', [id]);
  });
  await audit({ ...auth.user, organization_id: null }, 'delete', 'organization', id, {
    name: organization.name,
    customerNumber: organization.customer_number,
    permanent: true,
  });
  return NextResponse.json({ success: true });
}
