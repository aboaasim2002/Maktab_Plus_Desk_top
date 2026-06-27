import { NextResponse } from 'next/server';
import { authorize, requireOrganization } from '@/lib/api-auth';
import { audit, isOwnDataOnly } from '@/lib/auth';
import { execute, one } from '@/lib/postgres';

const JOIN_ONE = `
  SELECT c.*, cl.id AS cl_id, cl.name AS cl_name, cl.type AS cl_type,
    cl.phone AS cl_phone, cl.opening_balance AS cl_opening_balance,
    cl.notes AS cl_notes, cl.created_at AS cl_created_at, cl.updated_at AS cl_updated_at
  FROM contracts c
  LEFT JOIN clients cl ON cl.id=c.client_id AND cl.organization_id=c.organization_id
  WHERE c.id=$1 AND c.organization_id=$2
`;

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorize(request, 'operations.view');
  if (auth.error) return auth.error;
  const organizationId = requireOrganization(auth.user);
  const { id } = await params;
  const ownOnly = isOwnDataOnly(auth.user);
  const row = await one<Record<string, unknown>>(
    `${JOIN_ONE} ${ownOnly ? 'AND c.created_by=$3' : ''}`,
    ownOnly ? [id, organizationId, auth.user.id] : [id, organizationId]
  );
  if (!row) return NextResponse.json({ error: 'العملية غير موجودة' }, { status: 404 });
  return NextResponse.json(mapContractRow(row));
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorize(request, 'operations.edit');
  if (auth.error) return auth.error;
  const organizationId = requireOrganization(auth.user);
  const { id } = await params;
  const body = await request.json();
  const ownOnly = isOwnDataOnly(auth.user);
  const row = await one<Record<string, unknown>>(`
    UPDATE contracts c SET client_id=cl.id, description=$1, total_amount=$2,
      operation_type=$3, contract_date=$4, status=$5, notes=$6,
      updated_at=now(), updated_by=$7
    FROM clients cl
    WHERE c.id=$8 AND c.organization_id=$9
      AND cl.id=$10 AND cl.organization_id=$9
      ${ownOnly ? 'AND c.created_by=$11' : ''}
    RETURNING c.*
  `, [
    String(body.description ?? '').trim(), Number(body.total_amount), body.operation_type,
    body.contract_date, body.status, body.notes || null, auth.user.id, id,
    organizationId, body.client_id, ...(ownOnly ? [auth.user.id] : []),
  ]);
  if (!row) return NextResponse.json({ error: 'العملية غير موجودة' }, { status: 404 });
  await audit(auth.user, 'update', 'contract', id, {
    description: body.description, total_amount: body.total_amount,
  });
  return NextResponse.json(row);
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorize(request, 'operations.delete');
  if (auth.error) return auth.error;
  const organizationId = requireOrganization(auth.user);
  const { id } = await params;
  const ownOnly = isOwnDataOnly(auth.user);
  const operation = await one<{
    contract_number: number; description: string; total_amount: number;
  }>(`
    SELECT contract_number, description, total_amount FROM contracts
    WHERE id=$1 AND organization_id=$2 ${ownOnly ? 'AND created_by=$3' : ''}
  `, ownOnly ? [id, organizationId, auth.user.id] : [id, organizationId]);
  if (!operation) return NextResponse.json({ error: 'العملية غير موجودة' }, { status: 404 });
  await execute(
    `DELETE FROM contracts WHERE id=$1 AND organization_id=$2 ${ownOnly ? 'AND created_by=$3' : ''}`,
    ownOnly ? [id, organizationId, auth.user.id] : [id, organizationId]
  );
  await audit(auth.user, 'delete', 'contract', id, operation);
  return NextResponse.json({ success: true });
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
