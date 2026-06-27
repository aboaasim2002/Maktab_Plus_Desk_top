import { NextResponse } from 'next/server';
import { authorize } from '@/lib/api-auth';
import { audit, hashPassword, normalizeUsername } from '@/lib/auth';
import { one, query, transaction } from '@/lib/postgres';
import { refreshAccessSignature } from '@/lib/access-integrity';

export async function GET(request: Request) {
  const auth = await authorize(request);
  if (auth.error) return auth.error;
  if (auth.user.role !== 'platform_owner') {
    return NextResponse.json({ error: 'هذه الصفحة خاصة بمالك البرنامج' }, { status: 403 });
  }
  const organizations = await query(`
    SELECT o.*,
      u.id AS owner_id, u.arabic_name AS owner_name, u.username AS owner_username,
      (SELECT count(*)::int FROM users x WHERE x.organization_id = o.id) AS users_count
    FROM organizations o
    LEFT JOIN users u ON u.organization_id = o.id AND u.role = 'office_owner'
    ORDER BY o.created_at DESC
  `);
  const sequence = await one<{ last_value: number; is_called: boolean }>(`
    SELECT last_value::bigint, is_called FROM organization_customer_number_seq
  `);
  const nextCustomerNumber = sequence
    ? Number(sequence.last_value) + (sequence.is_called ? 1 : 0)
    : 1001;
  return NextResponse.json(organizations, {
    headers: { 'X-Next-Customer-Number': String(nextCustomerNumber) },
  });
}

export async function POST(request: Request) {
  const auth = await authorize(request);
  if (auth.error) return auth.error;
  if (auth.user.role !== 'platform_owner') {
    return NextResponse.json({ error: 'هذه العملية خاصة بمالك البرنامج' }, { status: 403 });
  }
  const body = await request.json();
  const name = String(body.name ?? '').trim();
  const ownerName = String(body.owner_name ?? '').trim();
  const ownerUsername = normalizeUsername(body.owner_username);
  const ownerPassword = String(body.owner_password ?? '');
  const subscriptionEndsAt = body.subscription_ends_at ? String(body.subscription_ends_at) : null;
  if (!name || !ownerName
    || !/^[A-Za-z0-9._-]{3,30}$/.test(ownerUsername) || ownerPassword.length < 8) {
    return NextResponse.json({
      error: 'أكمل بيانات المنشأة ومالكها، واستخدم كلمة مرور من 8 أحرف على الأقل',
    }, { status: 400 });
  }
  if (await one('SELECT 1 FROM users WHERE lower(username)=lower($1)', [ownerUsername])) {
    return NextResponse.json({ error: 'اسم مستخدم مالك المنشأة مستخدم مسبقًا' }, { status: 409 });
  }

  const result = await transaction(async (client) => {
    const customerNumberResult = await client.query<{ customer_number: number }>(`
      SELECT nextval('organization_customer_number_seq')::bigint AS customer_number
    `);
    const customerNumber = Number(customerNumberResult.rows[0].customer_number);
    const slug = `client-${customerNumber}`;
    const organization = await client.query<{ id: string; customer_number: number }>(`
      INSERT INTO organizations
        (customer_number, name, slug, phone, address, subscription_status, subscription_ends_at)
      VALUES ($1, $2, $3, $4, $5, 'active', $6)
      RETURNING id, customer_number
    `, [customerNumber, name, slug, body.phone || null, body.address || null, subscriptionEndsAt]);
    const organizationId = organization.rows[0].id;
    const owner = await client.query<{ id: string }>(`
      INSERT INTO users
        (organization_id, arabic_name, username, password_hash, role, permission_mode, access_signature)
      VALUES ($1, $2, $3, $4, 'office_owner', 'all', '')
      RETURNING id
    `, [organizationId, ownerName, ownerUsername, hashPassword(ownerPassword)]);
    await refreshAccessSignature(client, owner.rows[0].id);
    await client.query(`
      INSERT INTO sequences (organization_id, name, value)
      VALUES ($1, 'contract_number', 0), ($1, 'voucher_number', 0), ($1, 'invoice_number', 0)
    `, [organizationId]);
    await client.query(`
      INSERT INTO settings (organization_id, key, value)
      VALUES ($1, 'officeName', $2), ($1, 'officeAddress', $3)
    `, [organizationId, name, body.address || '']);
    return {
      id: organizationId,
      customer_number: organization.rows[0].customer_number,
      owner_id: owner.rows[0].id,
    };
  });
  await audit(auth.user, 'create', 'organization', result.id, {
    name,
    customerNumber: result.customer_number,
    ownerUsername,
  });
  return NextResponse.json(result, { status: 201 });
}
