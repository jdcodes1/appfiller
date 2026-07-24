import { isStorageEmpty, parseBackup, serializeBackup } from './lib/backup.js';
import { loadBackupHandle, hasReadWritePermission, writeThroughHandle } from './fsBackup.js';

async function restoreFromBackupIfEmpty() {
  const { values = {}, mappings = {} } = await chrome.storage.local.get(['values', 'mappings']);
  if (!isStorageEmpty({ values, mappings })) return;

  let res;
  try {
    res = await fetch(chrome.runtime.getURL('data/backup.json'));
  } catch (e) {
    console.warn('AppFiller: no backup file to restore from', e);
    return;
  }
  if (!res.ok) {
    console.warn(`AppFiller: no backup file to restore from (status ${res.status})`);
    return;
  }

  let restored;
  try {
    const text = await res.text();
    restored = parseBackup(text);
  } catch (e) {
    console.warn('AppFiller: backup file present but could not be parsed', e);
    return;
  }

  await chrome.storage.local.set({ values: restored.values, mappings: restored.mappings });
  console.log(
    `AppFiller: restored ${Object.keys(restored.values).length} values and ${Object.keys(restored.mappings).length} mappings from backup`
  );
}

chrome.runtime.onInstalled.addListener(() => { restoreFromBackupIfEmpty(); });
chrome.runtime.onStartup.addListener(() => { restoreFromBackupIfEmpty(); });

// Best-effort auto-backup: whenever values/mappings change (a save icon click,
// an options edit), rewrite the linked backup file. Runs in the service worker
// so it works even when the options page is closed. Never prompts — silently
// skips if no file is linked, permission lapsed, or the File System Access API
// isn't usable from a worker in this Chrome version.
let backupTimer = null;
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local' || (!changes.values && !changes.mappings)) return;
  clearTimeout(backupTimer);
  backupTimer = setTimeout(autoBackup, 1000);
});

async function autoBackup() {
  try {
    const handle = await loadBackupHandle();
    if (!handle) return;
    if (!(await hasReadWritePermission(handle, { interactive: false }))) return;
    const { values = {} } = await chrome.storage.local.get('values');
    const { mappings = {} } = await chrome.storage.local.get('mappings');
    const data = serializeBackup({ values, mappings }, new Date().toISOString());
    await writeThroughHandle(handle, JSON.stringify(data, null, 2));
  } catch (e) {
    console.warn('AppFiller: background auto-backup skipped', e);
  }
}
