import { NextResponse } from 'next/server';
import { authorize, requireOrganization } from '@/lib/api-auth';
import { audit, isOwnDataOnly } from '@/lib/auth';
import { nextSequence, query, transaction } from '@/lib/postgres';
import { tafqeet } from '@/lib/tafqeet';
import { insertInvoiceItems, roundMoney, sanitizeInvoiceItems } from '@/lib/invoice-helpers';

export async function GET(request: Request) {
  const auth = await authorize(request, 'invoices.view');
  if (auth.error) return auth.error;
  const organizationId = requireOrganization(auth.user);
  const searchParams = new URL(request.url).searchParams;
  const values: unknown[] = [organizationId];
  const conditions = ['i.organization_id=$1'];
  const add = (condition: string, value: string) => {
    if (!value) return;
    values.push(value);
    conditions.push(condition.replace('?', `$${values.length}`));
  };
  add("to_char(i.invoice_date, 'YYYY-MM') = ?", searchParams.get('month') ?? '');
  add('i.invoice_date >= ?', searchParams.get('from') ?? '');
  add('i.invoice_date <= ?', searchParams.get('to') ?? '');
  const search = String(searchParams.get('search') ?? '').trim();
  if (search) {
    values.push(`%${search}%`);
    conditions.push(`(
      CAST(i.invoice_number AS TEXT) ILIKE $${values.length}
      OR COALESCE(i.customer_name, '') ILIKE $${values.length}
    )`);
  }
  if (isOwnDataOnly(auth.user)) add('i.created_by = ?', auth.user.id);
  else add('i.created_by = ?', searchParams.get('user_id') ?? '');
  const rows = await query(`
    SELECT i.*, cu.arabic_name AS created_by_name, cu.username AS created_by_username,
      uu.arabic_name AS updated_by_name
    FROM invoices i
    LEFT JOIN users cu ON cu.id=i.created_by
    LEFT JOIN users uu ON uu.id=i.updated_by
    WHERE ${conditions.join(' AND ')}
    ORDER BY i.invoice_date DESC, i.invoice_number DESC
    ${search ? 'LIMIT 20' : ''}
  `, values);
  return NextResponse.json(rows);
}

export async function POST(request: Request) {
  const auth = await authorize(request, 'invoices.create');
  if (auth.error) return auth.error;
  const organizationId = requireOrganization(auth.user);
  const body = await request.json();
  const items = sanitizeInvoiceItems(body.items);
  if (!items.length) return NextResponse.json({ error: 'أضف بندًا واحدًا على الأقل' }, { status: 400 });
  const invoiceDate = String(body.invoice_date ?? '').trim();
  if (!invoiceDate) return NextResponse.json({ error: 'تاريخ الفاتورة مطلوب' }, { status: 400 });
  const total = roundMoney(items.reduce((sum, item) => sum + item.quantity * item.unit_price, 0));
  const amountText = tafqeet(total);
  const result = await transaction(async (client) => {
    const number = await nextSequence(organizationId, 'invoice_number', client);
    const inserted = await client.query<{ id: string }>(`
      INSERT INTO invoices
        (organization_id, invoice_number, invoice_date, customer_name,
         total_amount, amount_text, created_by, updated_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$7)
      RETURNING id
    `, [
      organizationId, number, invoiceDate,
      String(body.customer_name ?? '').trim() || null,
      total, amountText, auth.user.id,
    ]);
    const id = inserted.rows[0].id;
    await insertInvoiceItems(client, organizationId, id, items);
    return { id, number };
  });
  await audit(auth.user, 'create', 'invoice', result.id, {
    invoice_number: result.number, total, item_count: items.length,
  });
  return NextResponse.json({
    id: result.id, invoice_number: result.number, total_amount: total, amount_text: amountText,
  }, { status: 201 });
}
