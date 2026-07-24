import { serializeBackup } from './lib/backup.js';
import { loadBackupHandle, hasReadWritePermission, writeThroughHandle } from './fsBackup.js';

const $ = (id) => document.getElementById(id);

async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

function renderIconsBtn(shown) {
  $('icons').textContent = shown ? 'Hide save icons' : 'Show save icons';
  $('icons').classList.toggle('active', !!shown);
}

$('fill').addEventListener('click', async () => {
  const tab = await activeTab();
  try {
    const res = await chrome.tabs.sendMessage(tab.id, { action: 'fillPage' });
    $('fill').textContent = res ? `Filled ${res.filled}/${res.total}` : 'Fill page';
    renderIconsBtn(true); // runFill enables icons for the unfilled fields
  } catch (e) {
    $('fill').textContent = 'Not available here';
  }
});

$('icons').addEventListener('click', async () => {
  const tab = await activeTab();
  try {
    const { shown } = await chrome.tabs.sendMessage(tab.id, { action: 'iconsState' });
    const res = await chrome.tabs.sendMessage(tab.id, { action: shown ? 'hideIcons' : 'showIcons' });
    renderIconsBtn(res.shown);
  } catch (e) {
    $('icons').textContent = 'Not available here';
  }
});

(async () => {
  try {
    const tab = await activeTab();
    const { shown } = await chrome.tabs.sendMessage(tab.id, { action: 'iconsState' });
    renderIconsBtn(shown);
  } catch (e) { /* content script not on this page */ }
})();

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
