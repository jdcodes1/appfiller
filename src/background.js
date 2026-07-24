import { isStorageEmpty, parseBackup } from './lib/backup.js';

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
