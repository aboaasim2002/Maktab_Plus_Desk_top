import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'crypto';
import { getDb } from './sqlite';
import type { Permission } from './permissions';

export interface SessionUser {
  id: string;
  arabic_name: string;
  username: string;
  role: 'admin' | 'user';
  permission_mode: 'all' | 'custom';
  permissions: string[];
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  return `scrypt$v1$${salt}$${scryptSync(password, salt, 64).toString('hex')}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.startsWith('scrypt$v1$') ? stored.split('$') : stored.split(':');
  const salt = stored.startsWith('scrypt$v1$') ? parts[2] : parts[0];
  const hash = stored.startsWith('scrypt$v1$') ? parts[3] : parts[1];
  if (!salt || !hash) return false;
  try {
    const actual = scryptSync(password, salt, 64);
    const expected = Buffer.from(hash, 'hex');
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

export function normalizeUsername(value: unknown): string {
  return String(value ?? '').trim().toLowerCase();
}

export function createSession(userId: string): { token: string; expiresAt: Date } {
  const db = getDb();
  const token = randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 12 * 60 * 60 * 1000);
  db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(new Date().toISOString());
  db.prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)')
    .run(token, userId, expiresAt.toISOString());
  return { token, expiresAt };
}

export function deleteSession(token: string): void {
  getDb().prepare('DELETE FROM sessions WHERE token = ?').run(token);
}

function cookieValue(request: Request, name: string): string | null {
  const cookies = request.headers.get('cookie') ?? '';
  for (const part of cookies.split(';')) {
    const [key, ...value] = part.trim().split('=');
    if (key === name) return decodeURIComponent(value.join('='));
  }
  return null;
}

export function getSessionUser(request: Request): SessionUser | null {
  const token = cookieValue(request, 'office_session');
  if (!token) return null;
  const db = getDb();
  const row = db.prepare(`
    SELECT u.id, u.arabic_name, u.username, u.role, u.permission_mode
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.token = ? AND s.expires_at > ? AND u.is_active = 1
  `).get(token, new Date().toISOString()) as Omit<SessionUser, 'permissions'> | undefined;
  if (!row) return null;
  const permissions = db.prepare('SELECT permission FROM user_permissions WHERE user_id = ?')
    .all(row.id) as Array<{ permission: string }>;
  return { ...row, permissions: permissions.map((item) => item.permission) };
}

export function hasPermission(user: SessionUser, permission: Permission | string): boolean {
  return user.role === 'admin' || user.permission_mode === 'all' || user.permissions.includes(permission);
}

export function isOwnDataOnly(user: SessionUser): boolean {
  return user.role !== 'admin'
    && user.permission_mode === 'custom'
    && user.permissions.includes('scope.own_only');
}

export function audit(
  userId: string | null,
  action: string,
  entityType: string,
  entityId?: string | null,
  details?: unknown
): void {
  getDb().prepare(`
    INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, details)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    randomUUID(),
    userId,
    action,
    entityType,
    entityId ?? null,
    details === undefined ? null : JSON.stringify(details)
  );
}
