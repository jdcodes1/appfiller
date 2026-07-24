# AppFiller

Teach-once auto-fill for job-application fields (EEO/diversity + any custom data).

## Install (dev)
1. `npm install`
2. `chrome://extensions` → enable Developer mode → **Load unpacked** → select this folder.

## Use
1. Click the toolbar icon → **Edit my data** → add keys/values (e.g. `gender`=`Male`, `linkedin`=`https://…`).
2. On an application, click **Teach a field**, click a field, pick which data key fills it, Save.
3. On any future application, click **Fill page** — taught fields fill automatically. Optionally enable **Auto-fill on load**.

## Test
- Unit: `npm test`
- Manual: open `test/harness.html` in the browser with the extension loaded; teach each field, reload, Fill page. Verify the Race/Ethnicity custom dropdown fills.

## Backup & restore
Unpacked extensions derive their ID from the folder path, so moving/renaming the folder used to wipe `chrome.storage.local`. The manifest now pins a fixed `key`, so the extension ID stays stable even if the folder moves — your data survives a move.

Even so, deleting and re-loading the extension (or a fresh machine) starts with empty storage. To make that recoverable:
1. On the **Options** page, click **Link backup file…** and save it as `data/backup.json` inside this extension folder (do this once). This uses the File System Access API (Chrome/Edge); if it's unavailable, use **Export**/**Import** manually instead.
2. Click **Back up now** (Options or the popup) any time, or just keep the options page open — it auto-writes to the linked file whenever your data changes and it already has write permission.
3. If the extension is ever removed and reloaded unpacked with `data/backup.json` present, the background service worker restores `values`/`mappings` from it automatically on install/startup, but only when storage is currently empty — it never overwrites existing data.

`data/backup.json` and `key.pem` are in `.gitignore` and must never be committed — the former holds your personal EEO/diversity answers and other data, the latter is the private key used to derive the pinned extension `key`.

## Privacy
Auto-fill-on-load is opt-in (default off). When enabled, the content script runs on all sites and will automatically fill any field whose label matches a mapping you've taught — enable it knowingly. The manual **Fill page** button, which only fills on your click, is the safe default.
