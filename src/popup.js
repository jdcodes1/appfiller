import { serializeBackup } from './lib/backup.js';
import { loadBackupHandle, hasReadWritePermission, writeThroughHandle } from './fsBackup.js';

const $ = (id) => document.getElementById(id);
let teaching = false;

async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

$('fill').addEventListener('click', async () => {
  const tab = await activeTab();
  try {
    const res = await chrome.tabs.sendMessage(tab.id, { action: 'fillPage' });
    $('fill').textContent = res ? `Filled ${res.filled}/${res.total}` : 'Fill page';
  } catch (e) {
    $('fill').textContent = 'Not available here';
  }
});

$('teach').addEventListener('click', async () => {
  const tab = await activeTab();
  const nextTeaching = !teaching;
  try {
    await chrome.tabs.sendMessage(tab.id, { action: nextTeaching ? 'startTeach' : 'stopTeach' });
    teaching = nextTeaching;
    $('teach').textContent = teaching ? 'Stop teaching' : 'Teach a field';
    $('teach').classList.toggle('active', teaching);
  } catch (e) {
    $('teach').textContent = 'Not available here';
  }
});

$('opts').addEventListener('click', (e) => { e.preventDefault(); chrome.runtime.openOptionsPage(); });

$('backupNow').addEventListener('click', async () => {
  const btn = $('backupNow');
  const original = 'Back up now';
  if (typeof window.showSaveFilePicker !== 'function') {
    btn.textContent = 'Not supported here';
    setTimeout(() => { btn.textContent = original; }, 2000);
    return;
  }
  const handle = await loadBackupHandle();
  if (!handle) {
    btn.textContent = 'Link a file on Options first';
    setTimeout(() => { btn.textContent = original; }, 2500);
    return;
  }
  try {
    if (!(await hasReadWritePermission(handle, { interactive: true }))) {
      btn.textContent = 'Permission denied';
      setTimeout(() => { btn.textContent = original; }, 2000);
      return;
    }
    const { values = {} } = await chrome.storage.local.get('values');
    const { mappings = {} } = await chrome.storage.local.get('mappings');
    const data = serializeBackup({ values, mappings }, new Date().toISOString());
    await writeThroughHandle(handle, JSON.stringify(data, null, 2));
    btn.textContent = 'Backed up ✓';
  } catch (e) {
    btn.textContent = 'Backup failed';
  }
  setTimeout(() => { btn.textContent = original; }, 2000);
});

(async () => {
  const { settings = {} } = await chrome.storage.local.get('settings');
  $('auto').checked = !!settings.autoFillOnLoad;
})();
$('auto').addEventListener('change', async () => {
  const { settings = {} } = await chrome.storage.local.get('settings');
  settings.autoFillOnLoad = $('auto').checked;
  await chrome.storage.local.set({ settings });
});
