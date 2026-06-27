// ============================================================
// SQLite Database Layer — يستخدم node:sqlite المدمج في Node.js 22+
// لا يحتاج إلى تجميع أو مكتبات خارجية
// ============================================================

import { DatabaseSync } from 'node:sqlite';
import path from 'path';
import fs   from 'fs';
import { randomBytes, scryptSync } from 'crypto';

// ─── نوع عام مساعد ──────────────────────────────────────────
declare global {
  // eslint-disable-next-line no-var
  var _sqliteDb: DatabaseSync | undefined;
}

// ─── مسار ملف قاعدة البيانات ────────────────────────────────
function getDbPath(): string {
  const dataDir =
    process.env.ELECTRON_USER_DATA_PATH ||
    path.join(process.cwd(), '.data');

  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  return path.join(dataDir, 'binafif.db');
}

// ─── Singleton — تجنب فتح اتصالات متعددة (مهم في dev hot-reload) ─
export function getDb(): DatabaseSync {
  if (global._sqliteDb) return global._sqliteDb;

  const db = new DatabaseSync(getDbPath());
  initSchema(db);
  global._sqliteDb = db;
  return db;
}

// ─── إنشاء الجداول ──────────────────────────────────────────
function initSchema(db: DatabaseSync): void {
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS clients (
      id              TEXT PRIMARY KEY,
      name            TEXT NOT NULL,
      phone           TEXT,
      type            TEXT NOT NULL CHECK (type IN ('creditor','debtor')),
      opening_balance REAL NOT NULL DEFAULT 0,
      notes           TEXT,
      created_at      TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      updated_at      TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS contracts (
      id              TEXT PRIMARY KEY,
      contract_number INTEGER NOT NULL UNIQUE,
      client_id       TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
      description     TEXT NOT NULL,
      total_amount    REAL NOT NULL CHECK (total_amount > 0),
      operation_type  TEXT NOT NULL DEFAULT 'debit_on_client'
                      CHECK (operation_type IN ('debit_on_client','credit_on_client')),
      contract_date   TEXT NOT NULL DEFAULT (date('now','localtime')),
      status          TEXT NOT NULL DEFAULT 'active'
                      CHECK (status IN ('active','completed','cancelled')),
      notes           TEXT,
      created_at      TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      updated_at      TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS vouchers (
      id             TEXT PRIMARY KEY,
      voucher_number INTEGER NOT NULL UNIQUE,
      voucher_type   TEXT NOT NULL CHECK (voucher_type IN ('receipt','payment')),
      client_id      TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
      amount         REAL NOT NULL CHECK (amount > 0),
      amount_text    TEXT NOT NULL,
      payment_date   TEXT NOT NULL DEFAULT (date('now','localtime')),
      description    TEXT,
      created_at     TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS sequences (
      name  TEXT PRIMARY KEY,
      value INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS settings (
      key        TEXT PRIMARY KEY,
      value      TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS users (
      id              TEXT PRIMARY KEY,
      arabic_name     TEXT NOT NULL,
      username        TEXT NOT NULL UNIQUE COLLATE NOCASE,
      password_hash   TEXT NOT NULL,
      role            TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('admin','user')),
      permission_mode TEXT NOT NULL DEFAULT 'custom' CHECK (permission_mode IN ('all','custom')),
      is_active       INTEGER NOT NULL DEFAULT 1,
      created_by      TEXT,
      created_at      TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      updated_at      TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS user_permissions (
      user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      permission TEXT NOT NULL,
      PRIMARY KEY (user_id, permission)
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token      TEXT PRIMARY KEY,
      user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id          TEXT PRIMARY KEY,
      user_id     TEXT REFERENCES users(id) ON DELETE SET NULL,
      action      TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id   TEXT,
      details     TEXT,
      created_at  TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS services (
      id         TEXT PRIMARY KEY,
      name       TEXT NOT NULL UNIQUE COLLATE NOCASE,
      is_active  INTEGER NOT NULL DEFAULT 1,
      created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS invoices (
      id             TEXT PRIMARY KEY,
      invoice_number INTEGER NOT NULL UNIQUE,
      invoice_date   TEXT NOT NULL DEFAULT (date('now','localtime')),
      customer_name  TEXT,
      total_amount   REAL NOT NULL DEFAULT 0,
      amount_text    TEXT NOT NULL DEFAULT '',
      created_by     TEXT REFERENCES users(id) ON DELETE SET NULL,
      updated_by     TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_at     TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      updated_at     TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS invoice_items (
      id          TEXT PRIMARY KEY,
      invoice_id  TEXT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
      service_id  TEXT REFERENCES services(id) ON DELETE SET NULL,
      description TEXT NOT NULL,
      quantity    REAL NOT NULL DEFAULT 1 CHECK (quantity > 0),
      unit_price  REAL NOT NULL DEFAULT 0 CHECK (unit_price >= 0),
      line_total  REAL NOT NULL DEFAULT 0,
      line_order  INTEGER NOT NULL DEFAULT 0
    );

    INSERT OR IGNORE INTO sequences (name, value) VALUES ('contract_number', 0);
    INSERT OR IGNORE INTO sequences (name, value) VALUES ('voucher_number',  0);
    INSERT OR IGNORE INTO sequences (name, value) VALUES ('invoice_number',  0);
  `);

  ensureColumn(db, 'clients', 'created_by', 'TEXT');
  ensureColumn(db, 'clients', 'updated_by', 'TEXT');
  ensureColumn(db, 'contracts', 'created_by', 'TEXT');
  ensureColumn(db, 'contracts', 'updated_by', 'TEXT');
  ensureColumn(db, 'vouchers', 'created_by', 'TEXT');
  ensureColumn(db, 'vouchers', 'updated_by', 'TEXT');
  ensureColumn(db, 'vouchers', 'updated_at', 'TEXT');

  const admin = db.prepare("SELECT id FROM users WHERE username = 'admin' COLLATE NOCASE").get();
  if (!admin) {
    const salt = randomBytes(16).toString('hex');
    const hash = scryptSync('admin123', salt, 64).toString('hex');
    db.prepare(`
      INSERT INTO users
        (id, arabic_name, username, password_hash, role, permission_mode, is_active)
      VALUES (?, ?, 'admin', ?, 'admin', 'all', 1)
    `).run('admin-default-user', 'مدير النظام', `${salt}:${hash}`);
  }
}

function ensureColumn(db: DatabaseSync, table: string, column: string, definition: string): void {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  if (!columns.some((item) => item.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

// ─── توليد رقم تسلسلي ────────────────────────────────────────
export function nextSequence(name: 'contract_number' | 'voucher_number' | 'invoice_number'): number {
  const db = getDb();
  db.prepare('UPDATE sequences SET value = value + 1 WHERE name = ?').run(name);
  const row = db.prepare('SELECT value FROM sequences WHERE name = ?').get(name) as { value: number };
  return row.value;
}

export default getDb;
