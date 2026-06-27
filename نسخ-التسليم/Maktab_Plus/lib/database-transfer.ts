import { DatabaseSync } from 'node:sqlite';
import { createHmac, randomUUID, timingSafeEqual } from 'crypto';
import { query, transaction } from './postgres';

type SqliteRow = Record<string, string | number | null>;

export interface ImportResult {
  counts: { clients: number; operations: number; vouchers: number };
  duplicateClients: Array<{ importedName: string; existingName: string; phone: string }>;
}

function normalizePhone(value: unknown): string {
  return Array.from(String(value ?? ''), (character) => {
    const code = character.charCodeAt(0);
    if (code >= 0x0660 && code <= 0x0669) return String(code - 0x0660);
    if (code >= 0x06f0 && code <= 0x06f9) return String(code - 0x06f0);
    return character;
  }).join('').replace(/\D/g, '');
}

function validateDatabase(db: DatabaseSync): void {
  const check = db.prepare('PRAGMA quick_check').get() as { quick_check?: string } | undefined;
  if (check?.quick_check !== 'ok') throw new Error('ملف قاعدة البيانات غير صالح');
  for (const table of ['clients', 'contracts', 'vouchers']) {
    if (!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table)) {
      throw new Error('الملف لا يحتوي على بيانات مكتب بلس المطلوبة');
    }
  }
}

export async function importLegacySqlite(
  filePath: string,
  organizationId: string,
  actorId: string
): Promise<ImportResult> {
  const source = new DatabaseSync(filePath, { readOnly: true });
  const counts = { clients: 0, operations: 0, vouchers: 0 };
  const duplicateClients: ImportResult['duplicateClients'] = [];
  try {
    validateDatabase(source);
    const currentClients = await query<{ id: string; name: string; phone: string | null }>(
      'SELECT id, name, phone FROM clients WHERE organization_id=$1',
      [organizationId]
    );
    const phoneMap = new Map(
      currentClients
        .map((client) => [normalizePhone(client.phone), client] as const)
        .filter(([phone]) => Boolean(phone))
    );
    await transaction(async (client) => {
      const clientMap = new Map<string, string>();
      for (const item of source.prepare('SELECT * FROM clients').all() as SqliteRow[]) {
        const phone = normalizePhone(item.phone);
        const duplicate = phone ? phoneMap.get(phone) : undefined;
        if (duplicate) {
          clientMap.set(String(item.id), duplicate.id);
          duplicateClients.push({
            importedName: String(item.name),
            existingName: duplicate.name,
            phone: String(item.phone || phone),
          });
          continue;
        }
        const inserted = await client.query<{ id: string }>(`
          INSERT INTO clients
            (organization_id, name, phone, type, opening_balance, notes, created_by, updated_by)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$7) RETURNING id
        `, [
          organizationId, String(item.name), item.phone || null,
          item.type === 'creditor' ? 'creditor' : 'debtor',
          Number(item.opening_balance || 0), item.notes || null, actorId,
        ]);
        clientMap.set(String(item.id), inserted.rows[0].id);
        counts.clients++;
      }

      let maxContract = Number((await client.query<{ value: string }>(
        'SELECT COALESCE(max(contract_number),0) AS value FROM contracts WHERE organization_id=$1',
        [organizationId]
      )).rows[0].value);
      for (const item of source.prepare('SELECT * FROM contracts').all() as SqliteRow[]) {
        const clientId = clientMap.get(String(item.client_id));
        if (!clientId) continue;
        await client.query(`
          INSERT INTO contracts
            (organization_id, contract_number, client_id, description, total_amount,
             operation_type, contract_date, status, notes, created_by, updated_by)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$10)
        `, [
          organizationId, ++maxContract, clientId, String(item.description),
          Number(item.total_amount),
          item.operation_type === 'credit_on_client' ? 'credit_on_client' : 'debit_on_client',
          item.contract_date, ['active', 'completed', 'cancelled'].includes(String(item.status))
            ? item.status : 'active',
          item.notes || null, actorId,
        ]);
        counts.operations++;
      }

      let maxVoucher = Number((await client.query<{ value: string }>(
        'SELECT COALESCE(max(voucher_number),0) AS value FROM vouchers WHERE organization_id=$1',
        [organizationId]
      )).rows[0].value);
      for (const item of source.prepare('SELECT * FROM vouchers').all() as SqliteRow[]) {
        const clientId = clientMap.get(String(item.client_id));
        if (!clientId) continue;
        await client.query(`
          INSERT INTO vouchers
            (organization_id, voucher_number, voucher_type, client_id, amount,
             amount_text, payment_date, description, created_by, updated_by)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$9)
        `, [
          organizationId, ++maxVoucher,
          item.voucher_type === 'payment' ? 'payment' : 'receipt',
          clientId, Number(item.amount), String(item.amount_text),
          item.payment_date, item.description || null, actorId,
        ]);
        counts.vouchers++;
      }
      await client.query(`
        INSERT INTO sequences (organization_id, name, value)
        VALUES ($1,'contract_number',$2),($1,'voucher_number',$3)
        ON CONFLICT (organization_id,name) DO UPDATE SET value=GREATEST(sequences.value,excluded.value)
      `, [organizationId, maxContract, maxVoucher]);
    });
    return { counts, duplicateClients };
  } finally {
    source.close();
  }
}

export async function exportOrganizationData(organizationId: string) {
  const tables = [
    'clients', 'contracts', 'vouchers', 'settings', 'services',
    'invoices', 'invoice_items', 'sequences',
  ] as const;
  const data: Record<string, unknown[]> = {};
  for (const table of tables) {
    data[table] = await query(`SELECT * FROM ${table} WHERE organization_id=$1`, [organizationId]);
  }
  return {
    format: 'maktab-plus-postgresql-backup',
    version: 1,
    exported_at: new Date().toISOString(),
    organization_id: organizationId,
    data,
  };
}

function backupSecret(): string {
  const secret = process.env.BACKUP_SIGNING_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error('BACKUP_SIGNING_SECRET must be at least 32 characters');
  }
  return secret;
}

function signBackup(payload: string): string {
  return createHmac('sha256', backupSecret()).update(payload).digest('hex');
}

function sqlLiteral(value: unknown): string {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'NULL';
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  const text = value instanceof Date ? value.toISOString() : String(value);
  return `'${text.replace(/'/g, "''")}'`;
}

export async function exportOrganizationSql(
  organizationId: string,
  organizationName: string
): Promise<string> {
  const backup = await exportOrganizationData(organizationId);
  const payload = JSON.stringify(backup);
  const signature = signBackup(payload);
  const payloadChunks = Buffer.from(payload, 'utf8').toString('base64').match(/.{1,160}/g) ?? [];
  const deletionOrder = [
    'invoice_items', 'invoices', 'vouchers', 'contracts',
    'clients', 'services', 'settings', 'sequences',
  ];
  const insertionOrder = [
    'clients', 'services', 'contracts', 'vouchers',
    'invoices', 'invoice_items', 'settings', 'sequences',
  ];
  const lines = [
    '-- Maktab Plus PostgreSQL organization backup',
    `-- Organization: ${organizationName.replace(/\r?\n/g, ' ')}`,
    `-- Organization ID: ${organizationId}`,
    `-- Exported at: ${backup.exported_at}`,
    '-- Restore this file through Maktab Plus. Do not execute untrusted SQL files.',
    '-- MAKTAB_PLUS_BACKUP_VERSION:1',
    `-- MAKTAB_PLUS_ORGANIZATION_ID:${organizationId}`,
    `-- MAKTAB_PLUS_SIGNATURE:${signature}`,
    ...payloadChunks.map((chunk) => `-- MAKTAB_PLUS_PAYLOAD:${chunk}`),
    '',
    'BEGIN;',
    "SET client_encoding = 'UTF8';",
  ];

  for (const table of deletionOrder) {
    lines.push(`DELETE FROM ${table} WHERE organization_id = ${sqlLiteral(organizationId)};`);
  }

  for (const table of insertionOrder) {
    const rows = backup.data[table] as Record<string, unknown>[] | undefined;
    for (const row of rows ?? []) {
      const columns = Object.keys(row);
      const values = columns.map((column) => sqlLiteral(row[column]));
      lines.push(`INSERT INTO ${table} (${columns.join(', ')}) VALUES (${values.join(', ')});`);
    }
  }
  lines.push('COMMIT;', '');
  return lines.join('\n');
}

export function parseSignedOrganizationSql(sql: string): unknown {
  const version = sql.match(/^-- MAKTAB_PLUS_BACKUP_VERSION:(\d+)$/m)?.[1];
  const signature = sql.match(/^-- MAKTAB_PLUS_SIGNATURE:([a-f0-9]+)$/m)?.[1];
  const payload = [...sql.matchAll(/^-- MAKTAB_PLUS_PAYLOAD:(.+)$/gm)]
    .map((match) => match[1].trim())
    .join('');
  if (version !== '1' || !signature || !payload) {
    throw new Error('ملف SQL ليس نسخة احتياطية صادرة من مكتب بلس');
  }
  const decoded = Buffer.from(payload, 'base64').toString('utf8');
  const expected = signBackup(decoded);
  const actualBuffer = Buffer.from(signature, 'hex');
  const expectedBuffer = Buffer.from(expected, 'hex');
  if (
    actualBuffer.length !== expectedBuffer.length
    || !timingSafeEqual(actualBuffer, expectedBuffer)
  ) {
    throw new Error('توقيع النسخة الاحتياطية غير صحيح أو أن الملف تم تعديله');
  }
  return JSON.parse(decoded);
}

const restoreColumns = {
  clients: ['id', 'name', 'phone', 'type', 'opening_balance', 'notes', 'created_by', 'updated_by', 'created_at', 'updated_at'],
  services: ['id', 'name', 'is_active', 'created_by', 'created_at'],
  contracts: ['id', 'contract_number', 'client_id', 'description', 'total_amount', 'operation_type', 'contract_date', 'status', 'notes', 'created_by', 'updated_by', 'created_at', 'updated_at'],
  vouchers: ['id', 'voucher_number', 'voucher_type', 'client_id', 'amount', 'amount_text', 'payment_date', 'description', 'created_by', 'updated_by', 'created_at', 'updated_at'],
  invoices: ['id', 'invoice_number', 'invoice_date', 'customer_name', 'total_amount', 'amount_text', 'created_by', 'updated_by', 'created_at', 'updated_at'],
  invoice_items: ['id', 'invoice_id', 'service_id', 'description', 'quantity', 'unit_price', 'line_total', 'line_order'],
  settings: ['key', 'value', 'updated_at'],
  sequences: ['name', 'value'],
} as const;

type RestoreTable = keyof typeof restoreColumns;

export async function restoreOrganizationBackup(
  backup: unknown,
  organizationId: string
): Promise<{ counts: Record<RestoreTable, number> }> {
  const document = backup as {
    format?: string;
    version?: number;
    organization_id?: string;
    data?: Partial<Record<RestoreTable, unknown[]>>;
  };
  if (
    document?.format !== 'maktab-plus-postgresql-backup'
    || document.version !== 1
    || document.organization_id !== organizationId
    || !document.data
  ) {
    throw new Error('ملف النسخة الاحتياطية لا يخص هذه المنشأة أو أن صيغته غير صالحة');
  }
  const backupData = document.data;

  const counts = Object.fromEntries(
    Object.keys(restoreColumns).map((table) => [table, 0])
  ) as Record<RestoreTable, number>;

  await transaction(async (client) => {
    const validUsers = new Set(
      (await client.query<{ id: string }>(
        'SELECT id FROM users WHERE organization_id=$1',
        [organizationId]
      )).rows.map((row) => row.id)
    );

    for (const table of ['invoice_items', 'invoices', 'vouchers', 'contracts', 'clients', 'services', 'settings', 'sequences']) {
      await client.query(`DELETE FROM ${table} WHERE organization_id=$1`, [organizationId]);
    }

    const insertOrder: RestoreTable[] = [
      'clients', 'services', 'contracts', 'vouchers',
      'invoices', 'invoice_items', 'settings', 'sequences',
    ];
    for (const table of insertOrder) {
      const rows = Array.isArray(backupData[table]) ? backupData[table] as Record<string, unknown>[] : [];
      const columns = restoreColumns[table];
      for (const row of rows) {
        const values = columns.map((column) => {
          const value = row[column];
          if ((column === 'created_by' || column === 'updated_by') && value && !validUsers.has(String(value))) {
            return null;
          }
          return value ?? null;
        });
        const columnSql = ['organization_id', ...columns].join(', ');
        const placeholders = values.map((_, index) => `$${index + 2}`).join(', ');
        await client.query(
          `INSERT INTO ${table} (${columnSql}) VALUES ($1, ${placeholders})`,
          [organizationId, ...values]
        );
        counts[table]++;
      }
    }
  });

  return { counts };
}
