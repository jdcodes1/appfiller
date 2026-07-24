// Browser-only helper for linking + writing through a File System Access
// FileSystemFileHandle (e.g. data/backup.json inside the extension folder).
// Not unit-tested via node --test: relies on indexedDB / File System Access
// APIs that don't exist in the Node test environment.

const DB_NAME = 'appfiller-fs';
const STORE = 'handles';
const KEY = 'backupFile';

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => { req.result.createObjectStore(STORE); };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveBackupHandle(handle) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(handle, KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function loadBackupHandle() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get(KEY);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

// Checks (and if `interactive`, requests) readwrite permission on the handle.
// requestPermission() only works from a user-gesture call stack, so pass
// interactive:false from background/auto-save paths.
export async function hasReadWritePermission(handle, { interactive = false } = {}) {
  const opts = { mode: 'readwrite' };
  if ((await handle.queryPermission(opts)) === 'granted') return true;
  if (!interactive) return false;
  return (await handle.requestPermission(opts)) === 'granted';
}

export async function writeThroughHandle(handle, text) {
  const writable = await handle.createWritable();
  await writable.write(text);
  await writable.close();
}
