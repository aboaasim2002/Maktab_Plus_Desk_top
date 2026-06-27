import { NextResponse } from 'next/server';
import { authorize, requireOrganization } from '@/lib/api-auth';
import { audit, isOwnDataOnly } from '@/lib/auth';
import { nextSequence, one, query, transaction } from '@/lib/postgres';

const JOIN_SQL = `
  SELECT c.*, cl.id AS cl_id, cl.name AS cl_name, cl.type AS cl_type,
    cl.phone AS cl_phone, cl.opening_balance AS cl_opening_balance,
    cl.notes AS cl_notes, cl.created_at AS cl_created_at, cl.updated_at AS cl_updated_at
  FROM contracts c
  LEFT JOIN clients cl ON cl.id=c.client_id AND cl.organization_id=c.organization_id
`;

export async function GET(request: Request) {
  const auth = await authorize(request, 'operations.view');
  if (auth.error) return auth.error;
  const organizationId = requireOrganization(auth.user);
  const clientId = new URL(request.url).searchParams.get('client_id');
  const ownOnly = isOwnDataOnly(auth.user);
  const values: unknown[] = [organizationId];
  const conditions = ['c.organization_id=$1'];
  if (clientId) {
    values.push(clientId);
    conditions.push(`c.client_id=$${values.length}`);
  }
  if (ownOnly) {
    values.push(auth.user.id);
    conditions.push(`c.created_by=$${values.length}`);
  }
  const rows = await query<Record<string, unknown>>(
    `${JOIN_SQL} WHERE ${conditions.join(' AND ')} ORDER BY c.contract_date DESC`,
    values
  );
  return NextResponse.json(rows.map(mapContractRow));
}

export async function POST(request: Request) {
  const auth = await authorize(request, 'operations.create');
  if (auth.error) return auth.error;
  const organizationId = requireOrganization(auth.user);
  const body = await request.json();
  const result = await transaction(async (client) => {
    const number = await nextSequence(organizationId, 'contract_number', client);
    const inserted = await client.query(`
      INSERT INTO contracts
        (organization_id, contract_number, client_id, description, total_amount,
         operation_type, contract_date, status, notes, created_by, updated_by)
      SELECT $1,$2,cl.id,$4,$5,$6,$7,$8,$9,$10,$10
      FROM clients cl WHERE cl.id=$3 AND cl.organization_id=$1
      RETURNING *
    `, [
      organizationId, number, body.client_id, String(body.description ?? '').trim(),
      Number(body.total_amount), body.operation_type ?? 'debit_on_client',
      body.contract_date, body.status ?? 'active', body.notes || null, auth.user.id,
    ]);
    if (!inserted.rows[0]) throw new Error('CLIENT_NOT_FOUND');
    return { row: inserted.rows[0], number };
  }).catch((error) => {
    if (String(error).includes('CLIENT_NOT_FOUND')) return null;
    throw error;
  });
  if (!result) return NextResponse.json({ error: 'العميل غير موجود في منشأتك' }, { status: 400 });
  await audit(auth.user, 'create', 'contract', String(result.row.id), {
    contract_number: result.number,
    description: body.description,
    total_amount: body.total_amount,
  });
  return NextResponse.json(result.row, { status: 201 });
}

function mapContractRow(row: Record<string, unknown>) {
  return {
    id: row.id, contract_number: row.contract_number, client_id: row.client_id,
    description: row.description, total_amount: row.total_amount,
    operation_type: row.operation_type, contract_date: row.contract_date,
    status: row.status, notes: row.notes, created_at: row.created_at, updated_at: row.updated_at,
    clients: row.cl_id ? {
      id: row.cl_id, name: row.cl_name, type: row.cl_type, phone: row.cl_phone,
      opening_balance: row.cl_opening_balance, notes: row.cl_notes,
      created_at: row.cl_created_at, updated_at: row.cl_updated_at,
    } : undefined,
  };
}
