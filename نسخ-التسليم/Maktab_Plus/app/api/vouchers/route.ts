import { NextResponse } from 'next/server';
import { authorize, requireOrganization } from '@/lib/api-auth';
import { audit, isOwnDataOnly } from '@/lib/auth';
import { nextSequence, one, query, transaction } from '@/lib/postgres';

const JOIN_SQL = `
  SELECT v.*, cl.id AS cl_id, cl.name AS cl_name, cl.type AS cl_type,
    cl.phone AS cl_phone, cl.opening_balance AS cl_opening_balance
  FROM vouchers v
  LEFT JOIN clients cl ON cl.id=v.client_id AND cl.organization_id=v.organization_id
`;

export async function GET(request: Request) {
  const auth = await authorize(request, 'operations.view');
  if (auth.error) return auth.error;
  const organizationId = requireOrganization(auth.user);
  const clientId = new URL(request.url).searchParams.get('client_id');
  const ownOnly = isOwnDataOnly(auth.user);
  const values: unknown[] = [organizationId];
  const conditions = ['v.organization_id=$1'];
  if (clientId) {
    values.push(clientId);
    conditions.push(`v.client_id=$${values.length}`);
  }
  if (ownOnly) {
    values.push(auth.user.id);
    conditions.push(`v.created_by=$${values.length}`);
  }
  const rows = await query<Record<string, unknown>>(
    `${JOIN_SQL} WHERE ${conditions.join(' AND ')} ORDER BY v.payment_date DESC`,
    values
  );
  return NextResponse.json(rows.map(mapVoucherRow));
}

export async function POST(request: Request) {
  const auth = await authorize(request, 'vouchers.create');
  if (auth.error) return auth.error;
  const organizationId = requireOrganization(auth.user);
  const body = await request.json();
  const operation = await one(`
    SELECT 1 FROM contracts WHERE organization_id=$1 AND client_id=$2 LIMIT 1
  `, [organizationId, body.client_id]);
  if (!operation) {
    return NextResponse.json(
      { error: 'هذا العميل ليست له عمليات مسجلة. سجل عملية أولًا.' },
      { status: 400 }
    );
  }
  const result = await transaction(async (client) => {
    const number = await nextSequence(organizationId, 'voucher_number', client);
    const inserted = await client.query(`
      INSERT INTO vouchers
        (organization_id, voucher_number, voucher_type, client_id, amount, amount_text,
         payment_date, description, created_by, updated_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$9)
      RETURNING *
    `, [
      organizationId, number, body.voucher_type, body.client_id, Number(body.amount),
      body.amount_text, body.payment_date, body.description || null, auth.user.id,
    ]);
    return { row: inserted.rows[0], number };
  });
  await audit(auth.user, 'create', 'voucher', String(result.row.id), {
    voucher_number: result.number, voucher_type: body.voucher_type, amount: body.amount,
  });
  return NextResponse.json(result.row, { status: 201 });
}

function mapVoucherRow(row: Record<string, unknown>) {
  return {
    id: row.id, voucher_number: row.voucher_number, voucher_type: row.voucher_type,
    client_id: row.client_id, amount: row.amount, amount_text: row.amount_text,
    payment_date: row.payment_date, description: row.description, created_at: row.created_at,
    clients: row.cl_id ? {
      id: row.cl_id, name: row.cl_name, type: row.cl_type,
      phone: row.cl_phone, opening_balance: row.cl_opening_balance,
    } : undefined,
  };
}
