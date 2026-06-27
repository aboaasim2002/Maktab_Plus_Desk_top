import { randomUUID } from 'crypto';
import { NextResponse } from 'next/server';
import { authorize } from '@/lib/api-auth';
import { audit, isOwnDataOnly } from '@/lib/auth';
import { getDb, nextSequence } from '@/lib/sqlite';
import { tafqeet } from '@/lib/tafqeet';
import { insertInvoiceItems, roundMoney, sanitizeInvoiceItems } from '@/lib/invoice-helpers';

export async function GET(request: Request) {
  const auth = authorize(request, 'invoices.view');
  if (auth.error) return auth.error;
  const { searchParams } = new URL(request.url);
  const from = searchParams.get('from') ?? '';
  const to = searchParams.get('to') ?? '';
  const month = searchParams.get('month') ?? '';
  const requestedUserId = searchParams.get('user_id') ?? '';
  const conditions: string[] = [];
  const values: string[] = [];
  if (month) { conditions.push("substr(i.invoice_date, 1, 7) = ?"); values.push(month); }
  if (from) { conditions.push('i.invoice_date >= ?'); values.push(from); }
  if (to) { conditions.push('i.invoice_date <= ?'); values.push(to); }
  if (isOwnDataOnly(auth.user)) {
    conditions.push('i.created_by = ?');
    values.push(auth.user.id);
  } else if (requestedUserId) {
    conditions.push('i.created_by = ?');
    values.push(requestedUserId);
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const orderBy = conditions.length
    ? 'ORDER BY i.invoice_number ASC'
    : 'ORDER BY i.invoice_date DESC, i.invoice_number DESC';
  const rows = getDb().prepare(`
    SELECT i.*, cu.arabic_name AS created_by_name, cu.username AS created_by_username,
      uu.arabic_name AS updated_by_name
    FROM invoices i
    LEFT JOIN users cu ON cu.id = i.created_by
    LEFT JOIN users uu ON uu.id = i.updated_by
    ${where}
    ${orderBy}
  `).all(...values);
  return NextResponse.json(rows);
}

export async function POST(request: Request) {
  const auth = authorize(request, 'invoices.create');
  if (auth.error) return auth.error;
  const body = await request.json();
  const items = sanitizeInvoiceItems(body.items);
  if (!items.length) return NextResponse.json({ error: 'أضف بندًا واحدًا على الأقل للفاتورة' }, { status: 400 });
  const invoiceDate = String(body.invoice_date ?? '').trim();
  if (!invoiceDate) return NextResponse.json({ error: 'تاريخ الفاتورة مطلوب' }, { status: 400 });

  const db = getDb();
  const id = randomUUID();
  const number = nextSequence('invoice_number');
  const total = roundMoney(items.reduce((sum, item) => sum + item.quantity * item.unit_price, 0));
  const amountText = tafqeet(total);
  db.exec('BEGIN');
  try {
    db.prepare(`
      INSERT INTO invoices
        (id, invoice_number, invoice_date, customer_name, total_amount, amount_text, created_by, updated_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, number, invoiceDate, String(body.customer_name ?? '').trim() || null, total, amountText, auth.user.id, auth.user.id);
    insertInvoiceItems(id, items);
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  audit(auth.user.id, 'create', 'invoice', id, { invoice_number: number, total, item_count: items.length });
  return NextResponse.json({ id, invoice_number: number, total_amount: total, amount_text: amountText }, { status: 201 });
}
