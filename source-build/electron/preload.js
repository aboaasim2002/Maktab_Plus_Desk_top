// ============================================================
// Electron Preload — مكتب خدمات عامة
// ============================================================

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  backupDatabase:  () => ipcRenderer.invoke('backup-database'),
  confirmLogout:    () => ipcRenderer.invoke('confirm-logout'),
  resetAdminPassword: () => ipcRenderer.invoke('reset-admin-password'),
  importDatabase:  () => ipcRenderer.invoke('import-database'),
  getTrialStatus:  () => ipcRenderer.invoke('get-trial-status'),
  getSettings:     () => ipcRenderer.invoke('get-settings'),
  saveSettings:    (data) => ipcRenderer.invoke('save-settings', data),
});
