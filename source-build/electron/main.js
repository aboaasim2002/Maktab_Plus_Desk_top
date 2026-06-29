// ============================================================
// Electron Main Process — مكتب خدمات عامة
// ============================================================

const { app, BrowserWindow, Menu, ipcMain, dialog } = require('electron');
const path    = require('path');
const http    = require('http');
const fs      = require('fs');
const { spawn } = require('child_process');
const { DatabaseSync, backup } = require('node:sqlite');
const { randomBytes, randomUUID, scryptSync } = require('crypto');

const isDev = process.env.NODE_ENV === 'development';
const edition = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'edition.json'), 'utf8')
);
const IS_TRIAL = edition.trial === true;
const PORT = Number(edition.port) || 3192;
const TRIAL_DAYS = IS_TRIAL ? Math.max(1, Number(edition.trialDays) || 10) : 0;
const TRIAL_MS = TRIAL_DAYS * 24 * 60 * 60 * 1000;
const CLOCK_ROLLBACK_TOLERANCE_MS = 10 * 60 * 1000;

app.setName(edition.name || 'مكتب بلس');
const SHARED_DATA_PATH = path.join(app.getPath('appData'), edition.dataFolder);
const TRIAL_DATA_PATH = path.join(app.getPath('appData'), edition.trialFolder);
const TRIAL_FILE_PATH = path.join(TRIAL_DATA_PATH, 'trial.json');
app.setPath('userData', path.join(app.getPath('appData'), edition.runtimeFolder));

let mainWindow  = null;
let nextServer  = null;
let isQuitting = false;
let closePromptOpen = false;
let shutdownStarted = false;

function clearSavedSessions() {
  const dbPath = path.join(SHARED_DATA_PATH, 'binafif.db');
  if (!fs.existsSync(dbPath)) return;
  const db = new DatabaseSync(dbPath);
  try {
    const sessionsTable = db.prepare(
      "SELECT 1 FROM sqlite_master WHERE type='table' AND name='sessions'"
    ).get();
    if (sessionsTable) db.prepare('DELETE FROM sessions').run();
  } catch (error) {
    console.error('Failed to clear sessions:', error);
  } finally {
    db.close();
  }
}

function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  return `scrypt$v1$${salt}$${scryptSync(password, salt, 64).toString('hex')}`;
}

async function resetAdminPassword() {
  if (!mainWindow) return { success: false, message: 'نافذة البرنامج غير متاحة' };
  const { response } = await dialog.showMessageBox(mainWindow, {
    type: 'warning',
    title: 'استعادة كلمة مرور المدير',
    message: 'هل تريد إعادة كلمة مرور المستخدم الرئيسي admin إلى الكلمة الافتراضية؟',
    detail: 'ستصبح كلمة المرور: admin123 وسيتم إلغاء جميع جلسات الدخول الحالية.',
    buttons: ['استعادة كلمة المرور', 'إلغاء'],
    defaultId: 1,
    cancelId: 1,
    noLink: true,
  });
  if (response !== 0) return { success: false, canceled: true };

  const dbPath = path.join(SHARED_DATA_PATH, 'binafif.db');
  if (!fs.existsSync(dbPath)) return { success: false, message: 'قاعدة بيانات البرنامج غير موجودة' };
  const db = new DatabaseSync(dbPath);
  try {
    db.exec('BEGIN');
    const result = db.prepare(`
      UPDATE users
      SET password_hash = ?, updated_at = datetime('now','localtime')
      WHERE username = 'admin' COLLATE NOCASE AND role = 'admin'
    `).run(hashPassword('admin123'));
    if (!result.changes) {
      db.exec('ROLLBACK');
      return { success: false, message: 'لم يتم العثور على المستخدم الرئيسي admin' };
    }
    db.prepare('DELETE FROM sessions').run();
    const auditTable = db.prepare(
      "SELECT 1 FROM sqlite_master WHERE type='table' AND name='audit_logs'"
    ).get();
    if (auditTable) {
      db.prepare(`
        INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, details)
        VALUES (?, 'admin-default-user', 'reset_password', 'user', 'admin-default-user', ?)
      `).run(randomUUID(), JSON.stringify({ reset_to_default: true }));
    }
    db.exec('COMMIT');
    return { success: true, message: 'تمت استعادة كلمة مرور admin إلى admin123' };
  } catch (error) {
    try { db.exec('ROLLBACK'); } catch {}
    return { success: false, message: `تعذر استعادة كلمة المرور: ${error.message}` };
  } finally {
    db.close();
  }
}

function readTrialFile() {
  if (!fs.existsSync(TRIAL_FILE_PATH)) return null;
  return JSON.parse(fs.readFileSync(TRIAL_FILE_PATH, 'utf8'));
}

function writeTrialFile(data) {
  fs.mkdirSync(TRIAL_DATA_PATH, { recursive: true });
  fs.writeFileSync(TRIAL_FILE_PATH, JSON.stringify(data, null, 2), 'utf8');
}

function checkTrialStatus() {
  if (!IS_TRIAL) return { valid: true, remainingMs: 0 };

  const now = Date.now();

  try {
    let trial = readTrialFile();

    if (!trial) {
      trial = {
        firstRunAt: now,
        expiresAt: now + TRIAL_MS,
        lastSeenAt: now,
        trialDays: TRIAL_DAYS,
      };
      writeTrialFile(trial);
      return { valid: true, remainingMs: TRIAL_MS };
    }

    const firstRunAt = Number(trial.firstRunAt);
    const expiresAt = Number(trial.expiresAt || firstRunAt + TRIAL_MS);
    const lastSeenAt = Number(trial.lastSeenAt || firstRunAt);

    if (!Number.isFinite(firstRunAt) || !Number.isFinite(expiresAt) || !Number.isFinite(lastSeenAt)) {
      return { valid: false, reason: 'invalid' };
    }

    if (now + CLOCK_ROLLBACK_TOLERANCE_MS < lastSeenAt) {
      return { valid: false, reason: 'clock-rollback' };
    }

    if (now >= expiresAt) {
      return { valid: false, reason: 'expired' };
    }

    writeTrialFile({
      ...trial,
      expiresAt,
      lastSeenAt: now,
      trialDays: TRIAL_DAYS,
    });

    return { valid: true, remainingMs: expiresAt - now };
  } catch (error) {
    console.error('Trial check failed:', error);
    return { valid: false, reason: 'error' };
  }
}

function getTrialStatusForRenderer() {
  if (!IS_TRIAL) {
    return {
      isTrial: false,
      valid: true,
      daysRemaining: 0,
      expiresAt: null,
    };
  }

  const status = checkTrialStatus();
  const trial = readTrialFile();
  const remainingMs = Math.max(0, Number(status.remainingMs || 0));

  return {
    isTrial: true,
    valid: status.valid,
    daysRemaining: Math.max(0, Math.ceil(remainingMs / (24 * 60 * 60 * 1000))),
    expiresAt: trial?.expiresAt ? new Date(Number(trial.expiresAt)).toISOString() : null,
  };
}

async function showTrialExpiredMessage() {
  await dialog.showMessageBox({
    type: 'error',
    title: 'انتهت المدة التجريبية',
    message: 'انتهت المدة التجريبية',
    detail: 'تواصل مع البائع',
    buttons: ['موافق'],
    defaultId: 0,
    noLink: true,
  });
}

async function saveDatabaseBackup(parentWindow) {
  const dbPath = path.join(SHARED_DATA_PATH, 'binafif.db');

  if (!fs.existsSync(dbPath)) {
    return { success: false, message: 'قاعدة البيانات غير موجودة' };
  }

  const { filePath, canceled } = await dialog.showSaveDialog(parentWindow, {
    title: 'حفظ نسخة احتياطية',
    defaultPath: `نسخة-احتياطية-${new Date().toISOString().slice(0, 10)}.db`,
    filters: [{ name: 'قاعدة بيانات SQLite', extensions: ['db'] }],
  });

  if (canceled || !filePath) {
    return { success: false, canceled: true, message: 'تم إلغاء الحفظ' };
  }

  const sourceDb = new DatabaseSync(dbPath, { readOnly: true });
  try {
    await backup(sourceDb, filePath);
    return { success: true, message: 'تم حفظ النسخة الاحتياطية بنجاح' };
  } catch (error) {
    return { success: false, message: `فشل الحفظ: ${error.message}` };
  } finally {
    sourceDb.close();
  }
}

async function confirmClose() {
  if (!mainWindow || closePromptOpen) return;
  closePromptOpen = true;

  try {
    const { response } = await dialog.showMessageBox(mainWindow, {
      type: 'question',
      title: 'إغلاق البرنامج',
      message: 'هل تريد إنشاء نسخة احتياطية قبل إغلاق البرنامج؟',
      detail: 'اختر نعم لحفظ قاعدة البيانات، أو لا للخروج مباشرة.',
      buttons: ['نعم', 'لا'],
      defaultId: 0,
      cancelId: 1,
      noLink: true,
    });

    if (response === 0) {
      const result = await saveDatabaseBackup(mainWindow);
      if (result.canceled) return;

      if (!result.success) {
        await dialog.showMessageBox(mainWindow, {
          type: 'error',
          title: 'تعذر إنشاء النسخة الاحتياطية',
          message: result.message,
        });
        return;
      }
    }

    clearSavedSessions();
    await shutdownAndQuit();
  } finally {
    closePromptOpen = false;
  }
}

async function confirmLogout() {
  if (!mainWindow || closePromptOpen) return { proceed: false };
  closePromptOpen = true;
  try {
    const { response } = await dialog.showMessageBox(mainWindow, {
      type: 'question',
      title: 'تسجيل الخروج',
      message: 'هل تريد إنشاء نسخة احتياطية قبل تسجيل الخروج؟',
      detail: 'اختر نعم لحفظ نسخة احتياطية، أو لا للانتقال مباشرة إلى شاشة تسجيل الدخول.',
      buttons: ['نعم', 'لا', 'إلغاء'],
      defaultId: 0,
      cancelId: 2,
      noLink: true,
    });

    if (response === 2) return { proceed: false };
    if (response === 0) {
      const result = await saveDatabaseBackup(mainWindow);
      if (result.canceled) return { proceed: false };
      if (!result.success) {
        await dialog.showMessageBox(mainWindow, {
          type: 'error',
          title: 'تعذر إنشاء النسخة الاحتياطية',
          message: result.message,
        });
        return { proceed: false };
      }
    }
    return { proceed: true };
  } finally {
    closePromptOpen = false;
  }
}

// ─── انتظار حتى يصبح السيرفر جاهزاً ───────────────────────
function waitForServer(url, maxAttempts = 60) {
  return new Promise((resolve, reject) => {
    let count = 0;
    const tryConnect = () => {
      count++;
      const req = http.get(url, (res) => {
        if (res.statusCode && res.statusCode < 500) {
          resolve();
        } else if (count < maxAttempts) {
          setTimeout(tryConnect, 500);
        } else {
          reject(new Error(`Server at ${url} did not start`));
        }
      });
      req.on('error', () => {
        if (count < maxAttempts) {
          setTimeout(tryConnect, 500);
        } else {
          reject(new Error(`Cannot connect to ${url}`));
        }
      });
      req.end();
    };
    tryConnect();
  });
}

// ─── تشغيل سيرفر Next.js في الإنتاج ───────────────────────
function startNextServer() {
  if (isDev) return; // في التطوير يعمل السيرفر بشكل مستقل

  const serverScript = path.join(process.resourcesPath, 'server', 'server.js');
  const serverCwd    = path.join(process.resourcesPath, 'server');
  const trialStatus = getTrialStatusForRenderer();

  // ELECTRON_RUN_AS_NODE=1 يجعل Electron يعمل كـ Node.js عادي
  // NODE_NO_WARNINGS=1 يكتم التحذير التجريبي لـ node:sqlite
  nextServer = spawn(process.execPath, [serverScript], {
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1',
      NODE_NO_WARNINGS:     '1',
      NODE_ENV:  'production',
      PORT:      String(PORT),
      HOSTNAME:  '127.0.0.1',
      ELECTRON_USER_DATA_PATH: SHARED_DATA_PATH,
      ELECTRON_IS_TRIAL: IS_TRIAL ? '1' : '0',
      ELECTRON_TRIAL_DAYS_REMAINING: String(trialStatus.daysRemaining),
      ELECTRON_TRIAL_EXPIRES_AT: trialStatus.expiresAt || '',
    },
    cwd:   serverCwd,
    stdio: 'pipe',
    windowsHide: true,
  });
  const server = nextServer;

  server.stdout?.on('data', (d) =>
    console.log('[next]', d.toString().trim())
  );
  server.stderr?.on('data', (d) =>
    console.error('[next]', d.toString().trim())
  );
  server.on('error', (err) =>
    console.error('[next] spawn error:', err)
  );
  server.on('exit', () => {
    if (nextServer === server) nextServer = null;
  });
}

function killProcessTree(pid) {
  if (!pid) return Promise.resolve();

  if (process.platform === 'win32') {
    return new Promise((resolve) => {
      const killer = spawn('taskkill', ['/pid', String(pid), '/t', '/f'], {
        stdio: 'ignore',
        windowsHide: true,
      });
      killer.once('error', resolve);
      killer.once('close', resolve);
    });
  }

  try {
    process.kill(pid, 'SIGKILL');
  } catch {}
  return Promise.resolve();
}

async function stopNextServer() {
  if (!nextServer) return;
  const server = nextServer;
  const pid = server.pid;
  nextServer = null;

  let exited = server.exitCode !== null || server.signalCode !== null;
  const exitedPromise = new Promise((resolve) => {
    if (exited) return resolve();
    const finish = () => {
      exited = true;
      resolve();
    };
    server.once('exit', finish);
    server.once('error', finish);
  });

  try {
    server.kill('SIGTERM');
  } catch {}

  await Promise.race([
    exitedPromise,
    new Promise((resolve) => setTimeout(resolve, 1500)),
  ]);

  if (!exited) {
    await killProcessTree(pid);
    await Promise.race([
      exitedPromise,
      new Promise((resolve) => setTimeout(resolve, 500)),
    ]);
  }
}

async function shutdownAndQuit(exitCode = 0) {
  if (shutdownStarted) return;
  shutdownStarted = true;
  isQuitting = true;

  try {
    await stopNextServer();
  } catch (error) {
    console.error('Failed to stop Next.js server:', error);
  } finally {
    app.exit(exitCode);
  }
}

function validateDatabase(filePath) {
  const db = new DatabaseSync(filePath, { readOnly: true });
  try {
    const check = db.prepare('PRAGMA quick_check').get();
    if (!check || check.quick_check !== 'ok') throw new Error('ملف قاعدة البيانات غير صالح');
    for (const table of ['clients', 'contracts', 'vouchers']) {
      const found = db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table);
      if (!found) throw new Error('الملف لا يحتوي بيانات البرنامج المطلوبة');
    }
  } finally {
    db.close();
  }
}

async function importDatabase(parentWindow) {
  const selection = await dialog.showOpenDialog(parentWindow, {
    title: 'استيراد قاعدة بيانات',
    properties: ['openFile'],
    filters: [{ name: 'قاعدة بيانات SQLite', extensions: ['db', 'sqlite', 'sqlite3'] }],
  });
  if (selection.canceled || selection.filePaths.length === 0) {
    return { success: false, canceled: true, message: 'تم إلغاء الاستيراد' };
  }

  const sourcePath = selection.filePaths[0];
  const targetPath = path.join(SHARED_DATA_PATH, 'binafif.db');
  let serverStopped = false;
  try {
    validateDatabase(sourcePath);
    fs.mkdirSync(SHARED_DATA_PATH, { recursive: true });
    await stopNextServer();
    serverStopped = true;

    if (fs.existsSync(targetPath)) {
      const backupDir = path.join(SHARED_DATA_PATH, 'automatic-backups');
      fs.mkdirSync(backupDir, { recursive: true });
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      const currentDb = new DatabaseSync(targetPath, { readOnly: true });
      try {
        await backup(currentDb, path.join(backupDir, `before-import-${stamp}.db`));
      } finally {
        currentDb.close();
      }
    }

    const sourceDb = new DatabaseSync(sourcePath, { readOnly: true });
    const targetDb = new DatabaseSync(targetPath);
    const duplicateClients = [];
    const counts = { clients: 0, operations: 0, vouchers: 0 };

    const normalizePhone = (value) => Array.from(String(value || ''), (character) => {
      const code = character.charCodeAt(0);
      if (code >= 0x0660 && code <= 0x0669) return String(code - 0x0660);
      if (code >= 0x06f0 && code <= 0x06f9) return String(code - 0x06f0);
      return character;
    }).join('').replace(/\D/g, '');

    try {
      targetDb.exec('PRAGMA foreign_keys = ON; BEGIN IMMEDIATE;');
      const existingClients = targetDb.prepare('SELECT id, name, phone FROM clients').all();
      const phoneMap = new Map();
      for (const client of existingClients) {
        const phone = normalizePhone(client.phone);
        if (phone && !phoneMap.has(phone)) phoneMap.set(phone, client);
      }

      const clientIdMap = new Map();
      const idExists = targetDb.prepare('SELECT id FROM clients WHERE id = ?');
      const insertClient = targetDb.prepare(`
        INSERT INTO clients (id, name, phone, type, opening_balance, notes, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);

      for (const client of sourceDb.prepare('SELECT * FROM clients').all()) {
        const phone = normalizePhone(client.phone);
        const phoneMatch = phone ? phoneMap.get(phone) : null;
        if (phoneMatch) {
          clientIdMap.set(client.id, phoneMatch.id);
          duplicateClients.push({
            importedName: client.name,
            existingName: phoneMatch.name,
            phone: client.phone || phone,
          });
          continue;
        }

        const newId = idExists.get(client.id) ? randomUUID() : client.id;
        insertClient.run(
          newId,
          client.name,
          client.phone || null,
          client.type === 'creditor' ? 'creditor' : 'debtor',
          Number(client.opening_balance || 0),
          client.notes || null,
          client.created_at || new Date().toISOString(),
          client.updated_at || client.created_at || new Date().toISOString()
        );
        clientIdMap.set(client.id, newId);
        if (phone) phoneMap.set(phone, { id: newId, name: client.name, phone: client.phone });
        counts.clients++;
      }

      let maxOperationNumber = Number(
        targetDb.prepare('SELECT COALESCE(MAX(contract_number), 0) AS value FROM contracts').get().value
      );
      const operationIdExists = targetDb.prepare('SELECT 1 FROM contracts WHERE id = ?');
      const operationNumberExists = targetDb.prepare('SELECT 1 FROM contracts WHERE contract_number = ?');
      const insertOperation = targetDb.prepare(`
        INSERT INTO contracts
          (id, contract_number, client_id, description, total_amount, operation_type,
           contract_date, status, notes, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const operation of sourceDb.prepare('SELECT * FROM contracts').all()) {
        if (operationIdExists.get(operation.id)) continue;
        const clientId = clientIdMap.get(operation.client_id);
        if (!clientId) continue;
        let number = Number(operation.contract_number);
        if (!number || operationNumberExists.get(number)) number = ++maxOperationNumber;
        maxOperationNumber = Math.max(maxOperationNumber, number);
        insertOperation.run(
          operation.id,
          number,
          clientId,
          operation.description,
          operation.total_amount,
          operation.operation_type === 'credit_on_client' ? 'credit_on_client' : 'debit_on_client',
          operation.contract_date,
          ['active', 'completed', 'cancelled'].includes(operation.status) ? operation.status : 'active',
          operation.notes || null,
          operation.created_at || new Date().toISOString(),
          operation.updated_at || operation.created_at || new Date().toISOString()
        );
        counts.operations++;
      }

      let maxVoucherNumber = Number(
        targetDb.prepare('SELECT COALESCE(MAX(voucher_number), 0) AS value FROM vouchers').get().value
      );
      const voucherIdExists = targetDb.prepare('SELECT 1 FROM vouchers WHERE id = ?');
      const voucherNumberExists = targetDb.prepare('SELECT 1 FROM vouchers WHERE voucher_number = ?');
      const insertVoucher = targetDb.prepare(`
        INSERT INTO vouchers
          (id, voucher_number, voucher_type, client_id, amount, amount_text,
           payment_date, description, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const voucher of sourceDb.prepare('SELECT * FROM vouchers').all()) {
        if (voucherIdExists.get(voucher.id)) continue;
        const clientId = clientIdMap.get(voucher.client_id);
        if (!clientId) continue;
        let number = Number(voucher.voucher_number);
        if (!number || voucherNumberExists.get(number)) number = ++maxVoucherNumber;
        maxVoucherNumber = Math.max(maxVoucherNumber, number);
        insertVoucher.run(
          voucher.id,
          number,
          voucher.voucher_type === 'payment' ? 'payment' : 'receipt',
          clientId,
          voucher.amount,
          voucher.amount_text,
          voucher.payment_date,
          voucher.description || null,
          voucher.created_at || new Date().toISOString()
        );
        counts.vouchers++;
      }

      targetDb.prepare(`
        INSERT INTO sequences (name, value) VALUES ('contract_number', ?)
        ON CONFLICT(name) DO UPDATE SET value = MAX(value, excluded.value)
      `).run(maxOperationNumber);
      targetDb.prepare(`
        INSERT INTO sequences (name, value) VALUES ('voucher_number', ?)
        ON CONFLICT(name) DO UPDATE SET value = MAX(value, excluded.value)
      `).run(maxVoucherNumber);
      targetDb.exec('COMMIT;');
    } catch (error) {
      try { targetDb.exec('ROLLBACK;'); } catch {}
      throw error;
    } finally {
      sourceDb.close();
      targetDb.close();
    }

    startNextServer();
    await waitForServer(`http://localhost:${PORT}`);
    serverStopped = false;
    mainWindow?.reload();
    return {
      success: true,
      message: 'تم استيراد البيانات بنجاح',
      counts,
      duplicateClients,
    };
  } catch (error) {
    if (serverStopped || !nextServer) {
      startNextServer();
      try { await waitForServer(`http://localhost:${PORT}`); } catch {}
    }
    return { success: false, message: `تعذر استيراد البيانات: ${error.message}` };
  }
}

// ─── إنشاء نافذة التطبيق ────────────────────────────────────
function createWindow() {
  mainWindow = new BrowserWindow({
    width:    1280,
    height:   820,
    minWidth: 960,
    minHeight: 640,
    webPreferences: {
      preload:          path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration:  false,
      devTools:         isDev,
    },
    title:           'برنامج سندات الصرف والقبض',
    show:            false,
    backgroundColor: '#f8fafc',
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    if (isDev) {
      mainWindow.webContents.openDevTools({ mode: 'detach' });
    }
  });

  // إزالة القائمة الافتراضية
  Menu.setApplicationMenu(null);

  mainWindow.loadURL(`http://localhost:${PORT}/login`);

  mainWindow.on('close', (event) => {
    if (isQuitting) return;
    event.preventDefault();
    void confirmClose();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// ─── تشغيل التطبيق ──────────────────────────────────────────
app.whenReady().then(async () => {
  if (IS_TRIAL) {
    const trialStatus = checkTrialStatus();
    if (!trialStatus.valid) {
      await showTrialExpiredMessage();
      await shutdownAndQuit();
      return;
    }
  }

  // لا نحتفظ بأي جلسة دخول بين تشغيل وآخر.
  clearSavedSessions();

  // تمرير مسار بيانات المستخدم لقاعدة البيانات SQLite
  process.env.ELECTRON_USER_DATA_PATH = SHARED_DATA_PATH;

  startNextServer();

  try {
    await waitForServer(`http://localhost:${PORT}`);
  } catch (err) {
    console.error('فشل الاتصال بالسيرفر:', err);
    await shutdownAndQuit(1);
    return;
  }

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') void shutdownAndQuit();
});

app.on('before-quit', (event) => {
  if (shutdownStarted || !nextServer) return;
  event.preventDefault();
  void shutdownAndQuit();
});

// ─── IPC: نسخ احتياطي لقاعدة البيانات ──────────────────────
ipcMain.handle('backup-database', async () => {
  return saveDatabaseBackup(mainWindow);
});

ipcMain.handle('confirm-logout', async () => {
  return confirmLogout();
});

ipcMain.handle('reset-admin-password', async () => {
  return resetAdminPassword();
});

ipcMain.handle('import-database', async () => {
  return importDatabase(mainWindow);
});

ipcMain.handle('get-trial-status', async () => {
  return getTrialStatusForRenderer();
});

// ─── إعدادات المكتب ───────────────────────────────────────────────────────────
const settingsPath = path.join(SHARED_DATA_PATH, 'settings.json');

ipcMain.handle('get-settings', async () => {
  try {
    if (fs.existsSync(settingsPath)) {
      return JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    }
    return { officeName: '', officeAddress: '', officePhone: '' };
  } catch (e) {
    return { officeName: '', officeAddress: '', officePhone: '' };
  }
});

ipcMain.handle('save-settings', async (_, data) => {
  try {
    fs.writeFileSync(settingsPath, JSON.stringify(data, null, 2), 'utf8');
    return { success: true };
  } catch (e) {
    return { success: false, message: e.message };
  }
});
