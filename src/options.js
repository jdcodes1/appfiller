import { serializeBackup, parseBackup, mergeBackup } from './lib/backup.js';
import { saveBackupHandle, loadBackupHandle, hasReadWritePermission, writeThroughHandle } from './fsBackup.js';

const g = (k) => chrome.storage.local.get(k);
const s = (o) => chrome.storage.local.set(o);
const supportsFS = typeof window.showSaveFilePicker === 'function';
let linkedHandle = null;

function setStatus(msg, isError = false) {
  const el = document.getElementById('backupStatus');
  el.textContent = msg;
  el.classList.toggle('error', !!isError);
}

async function currentState() {
  const { values = {} } = await g('values');
  const { mappings = {} } = await g('mappings');
  return { values, mappings };
}

function downloadBackup(data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'appfiller-backup.json';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

async function refreshLinkedStatus() {
  const el = document.getElementById('linkStatus');
  if (!supportsFS) {
    el.textContent = 'File System Access API not available in this browser.';
    return;
  }
  linkedHandle = await loadBackupHandle();
  el.textContent = linkedHandle ? `Linked: ${linkedHandle.name}` : 'No backup file linked.';
}

async function renderValues() {
  const { values = {} } = await g('values');
  const tb = document.querySelector('#values tbody');
  tb.innerHTML = '';
  for (const [k, v] of Object.entries(values)) {
    const tr = document.createElement('tr');

    const keyTd = document.createElement('td');
    keyTd.textContent = k;

    const valTd = document.createElement('td');
    const input = document.createElement('input');
    input.value = v;
    input.addEventListener('change', async (e) => {
      const { values = {} } = await g('values'); values[k] = e.target.value; await s({ values });
    });
    valTd.appendChild(input);

    const btnTd = document.createElement('td');
    const btn = document.createElement('button');
    btn.textContent = '✕';
    btn.addEventListener('click', async () => {
      const { values = {} } = await g('values'); delete values[k]; await s({ values }); renderValues();
    });
    btnTd.appendChild(btn);

    tr.appendChild(keyTd); tr.appendChild(valTd); tr.appendChild(btnTd);
    tb.appendChild(tr);
  }
}

async function renderMaps() {
  const { mappings = {} } = await g('mappings');
  const tb = document.querySelector('#maps tbody');
  tb.innerHTML = '';
  for (const [fp, vk] of Object.entries(mappings)) {
    const tr = document.createElement('tr');

    const fpTd = document.createElement('td');
    fpTd.textContent = fp;

    const vkTd = document.createElement('td');
    vkTd.textContent = vk;

    const btnTd = document.createElement('td');
    const btn = document.createElement('button');
    btn.textContent = '✕';
    btn.addEventListener('click', async () => {
      const { mappings = {} } = await g('mappings'); delete mappings[fp]; await s({ mappings }); renderMaps();
    });
    btnTd.appendChild(btn);

    tr.appendChild(fpTd); tr.appendChild(vkTd); tr.appendChild(btnTd);
    tb.appendChild(tr);
  }
}

document.getElementById('add').addEventListener('click', async () => {
  const k = document.getElementById('newkey').value.trim();
  const v = document.getElementById('newval').value;
  if (!k) return;
  const { values = {} } = await g('values'); values[k] = v; await s({ values });
  document.getElementById('newkey').value = ''; document.getElementById('newval').value = '';
  renderValues();
});

document.getElementById('export').addEventListener('click', async () => {
  const data = serializeBackup(await currentState(), new Date().toISOString());
  downloadBackup(data);
  setStatus('Exported backup.');
});

document.getElementById('import').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  const text = await file.text();
  let incoming;
  try {
    incoming = parseBackup(text);
  } catch (err) {
    setStatus(err.message, true);
    return;
  }
  const merged = mergeBackup(await currentState(), incoming);
  await s({ values: merged.values, mappings: merged.mappings });
  renderValues();
  renderMaps();
  setStatus(`Imported ${Object.keys(incoming.values).length} values, ${Object.keys(incoming.mappings).length} mappings`);
});

document.getElementById('linkFile').addEventListener('click', async () => {
  if (!supportsFS) {
    setStatus('File System Access API not available in this browser.', true);
    return;
  }
  try {
    const handle = await window.showSaveFilePicker({
      suggestedName: 'backup.json',
      types: [{ description: 'JSON', accept: { 'application/json': ['.json'] } }],
    });
    await saveBackupHandle(handle);
    linkedHandle = handle;
    await refreshLinkedStatus();
    setStatus('Backup file linked.');
  } catch (e) {
    if (e.name !== 'AbortError') setStatus(`Could not link file: ${e.message}`, true);
  }
});

document.getElementById('backupNow').addEventListener('click', async () => {
  const data = serializeBackup(await currentState(), new Date().toISOString());
  const text = JSON.stringify(data, null, 2);
  if (supportsFS && linkedHandle) {
    if (await hasReadWritePermission(linkedHandle, { interactive: true })) {
      try {
        await writeThroughHandle(linkedHandle, text);
        setStatus('Backed up to linked file.');
        return;
      } catch (e) {
        setStatus(`Write failed (${e.message}) — downloading instead.`, true);
        downloadBackup(data);
        return;
      }
    }
    setStatus('Permission denied — downloading instead.', true);
    downloadBackup(data);
    return;
  }
  setStatus('No file linked — downloading backup instead.');
  downloadBackup(data);
});

// Auto-write to the linked file whenever storage changes, if we already
// have permission. Never prompt here — this isn't a user gesture.
chrome.storage.onChanged.addListener(async (changes, area) => {
  if (area !== 'local' || (!changes.values && !changes.mappings)) return;
  if (!supportsFS || !linkedHandle) return;
  if (!(await hasReadWritePermission(linkedHandle, { interactive: false }))) return;
  const data = serializeBackup(await currentState(), new Date().toISOString());
  try {
    await writeThroughHandle(linkedHandle, JSON.stringify(data, null, 2));
  } catch (e) {
    console.warn('AppFiller: auto-backup write failed', e);
  }
});

renderValues(); renderMaps(); refreshLinkedStatus();
