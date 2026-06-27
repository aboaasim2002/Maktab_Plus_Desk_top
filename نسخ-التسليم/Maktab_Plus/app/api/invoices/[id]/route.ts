import { NextResponse } from 'next/server';
import { authorize, requireOrganization } from '@/lib/api-auth';
import { audit, isOwnDataOnly } from '@/lib/auth';
import { one, query, transaction } from '@/lib/postgres';
import { tafqeet } from '@/lib/tafqeet';
import { insertInvoiceItems, roundMoney, sanitizeInvoiceItems } from '@/lib/invoice-helpers';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorize(request, 'invoices.view');
  if (auth.error) return auth.error;
  const organizationId = requireOrganization(auth.user);
  const { id } = await params;
  const ownOnly = isOwnDataOnly(auth.user);
  const invoice = await one(`
    SELECT i.*, cu.arabic_name AS created_by_name, uu.arabic_name AS updated_by_name
    FROM invoices i
    LEFT JOIN users cu ON cu.id=i.created_by
    LEFT JOIN users uu ON uu.id=i.updated_by
    WHERE i.id=$1 AND i.organization_id=$2 ${ownOnly ? 'AND i.created_by=$3' : ''}
  `, ownOnly ? [id, organizationId, auth.user.id] : [id, organizationId]);
  if (!invoice) return NextResponse.json({ error: 'الفاتورة غير موجودة' }, { status: 404 });
  const items = await query(`
    SELECT * FROM invoice_items WHERE invoice_id=$1 AND organization_id=$2 ORDER BY line_order
  `, [id, organizationId]);
  return NextResponse.json({ ...invoice, items });
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorize(request, 'invoices.edit');
  if (auth.error) return auth.error;
  const organizationId = requireOrganization(auth.user);
  const { id } = await params;
  const body = await request.json();
  const items = sanitizeInvoiceItems(body.items);
  if (!items.length) return NextResponse.json({ error: 'أضف بندًا واحدًا على الأقل' }, { status: 400 });
  const total = roundMoney(items.reduce((sum, item) => sum + item.quantity * item.unit_price, 0));
  const amountText = tafqeet(total);
  const ownOnly = isOwnDataOnly(auth.user);
  const updated = await transaction(async (client) => {
    const result = await client.query(`
      UPDATE invoices SET invoice_date=$1, customer_name=$2, total_amount=$3,
        amount_text=$4, updated_by=$5, updated_at=now()
      WHERE id=$6 AND organization_id=$7 ${ownOnly ? 'AND created_by=$8' : ''}
      RETURNING id
    `, [
      body.invoice_date, String(body.customer_name ?? '').trim() || null,
      total, amountText, auth.user.id, id, organizationId,
      ...(ownOnly ? [auth.user.id] : []),
    ]);
    if (!result.rows[0]) return false;
    await client.query(
      'DELETE FROM invoice_items WHERE invoice_id=$1 AND organization_id=$2',
      [id, organizationId]
    );
    await insertInvoiceItems(client, organizationId, id, items);
    return true;
  });
  if (!updated) return NextResponse.json({ error: 'الفاتورة غير موجودة' }, { status: 404 });
  await audit(auth.user, 'update', 'invoice', id, { total, item_count: items.length });
  return NextResponse.json({ success: true, total_amount: total, amount_text: amountText });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorize(request, 'invoices.delete');
  if (auth.error) return auth.error;
  const organizationId = requireOrganization(auth.user);
  const { id } = await params;
  const ownOnly = isOwnDataOnly(auth.user);
  const row = await one<{ invoice_number: number; total_amount: number }>(`
    DELETE FROM invoices
    WHERE id=$1 AND organization_id=$2 ${ownOnly ? 'AND created_by=$3' : ''}
    RETURNING invoice_number, total_amount
  `, ownOnly ? [id, organizationId, auth.user.id] : [id, organizationId]);
  if (!row) return NextResponse.json({ error: 'الفاتورة غير موجودة' }, { status: 404 });
  await audit(auth.user, 'delete', 'invoice', id, row);
  return NextResponse.json({ success: true });
}
