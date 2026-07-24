# AppFiller

Save-once auto-fill for job applications (Greenhouse, Ashby, and anything with standard form controls). Fill an application by hand once, click the 💾 icons to bank each answer, and every future application fills itself.

## Install (dev)
1. `npm install`
2. `chrome://extensions` → enable Developer mode → **Load unpacked** → select this folder.

## Use
1. Open a job application and fill it out normally.
2. Click the toolbar icon → **Fill page**. Anything already saved fills in; every other field gets a 💾 icon next to it.
3. Click a 💾 to save that field's current value. The key is auto-generated from the field's label (`First Name *` → `first_name`) — no manual key entry. Icons disappear as fields become auto-fillable. Press Esc to hide them.
4. On the next application, **Fill page** (or enable **Auto-fill on load**) fills text, textareas, selects, radios, checkboxes, and custom dropdowns.
5. **Edit my data** opens the Options page to review, edit, or delete saved values and field mappings.

Fields are matched by normalized label text + field type, so `Email` on Greenhouse also fills `Email` on Ashby.

### Dropdown support
- react-select style (Greenhouse): options are searched in the listbox the combobox points at (`aria-controls`), typed-to-filter, then clicked.
- Keyboard-driven comboboxes (Ashby): selection commits via ArrowDown/Enter when clicks are ignored; failed matches close with Escape.
- Async search lists (locations, schools): the saved text is retried in progressively shorter queries ("New York City, New York, United States" → "New York City").

## Test
- Unit: `npm test` (node --test + jsdom, 51 tests)
- Manual: open `test/harness.html` with the extension loaded, or any live Greenhouse/Ashby posting.

## Backup & restore
Unpacked extensions derive their ID from the folder path, so moving/renaming the folder used to wipe `chrome.storage.local`. The manifest pins a fixed `key`, so the extension ID stays stable even if the folder moves — your data survives a move.

Deleting and re-loading the extension (or a fresh machine) starts with empty storage. To make that recoverable:
1. On the **Options** page, click **Link backup file…** and save it as `data/backup.json` inside this extension folder (once). Uses the File System Access API; if unavailable, use **Export**/**Import** manually.
2. Backups then write automatically whenever your data changes (from the options page, and best-effort from the background service worker). **Back up now** buttons exist on the popup and Options.
3. When the extension is reloaded unpacked with `data/backup.json` present, the background service worker restores `values`/`mappings` automatically on install/startup — only when storage is empty; it never overwrites existing data.

`data/backup.json` and `key.pem` are in `.gitignore` and must never be committed — the former holds your personal EEO/diversity answers and other data, the latter is the private key behind the pinned extension ID.

## Privacy
Auto-fill-on-load is opt-in (default off). When enabled, the content script fills any field whose label matches a saved mapping on any site — enable it knowingly. The manual **Fill page** button is the safe default. All data stays in `chrome.storage.local` and your linked backup file; nothing leaves your machine.
