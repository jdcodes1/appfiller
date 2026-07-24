# AppFiller — project context

Chrome MV3 extension that auto-fills job applications (Greenhouse, Ashby, generic forms) from values saved once via inline 💾 icons.

## Architecture
- `manifest.json` — MV3; pinned `key` (stable extension ID `eoblngbnhhdafbioilkgealflbikdgna` regardless of folder path); content script on `<all_urls>` at `document_idle`; permissions: `storage`, `activeTab` only.
- `src/content-loader.js` — classic script that dynamic-imports `src/content.js` (MV3 content scripts can't be ES modules; module files are in `web_accessible_resources`).
- `src/content.js` — field scan (`collectFields`), fill orchestration (`fillPage`, `autoFillWithRetries` for React/SPA re-render races), `openAndWaitReal` (dropdown open + progressive query shortening), message handlers (`fillPage`, `showIcons`, `hideIcons`, `iconsState`).
- `src/lib/fingerprint.js` — field identity = `normalize(label)|type`. Label chain: aria-label → aria-labelledby → label[for] → radio/checkbox fieldset legend → wrapping label → fieldset legend → single-label ancestor wrapper (Ashby) → placeholder → name. `isComboboxInput` classifies `input[role=combobox]`/`aria-autocomplete` as dropdowns (the core Greenhouse fix).
- `src/lib/fillers.js` — `setNativeValue` (React `_valueTracker` staling), `fillSelect/Radio/Checkbox/Dropdown`, `findOptions` (scoped to `aria-controls` listbox first — pages carry hidden `[role=option]` lists like intl-tel-input's 245 countries), `keyboardCommit` (Ashby ArrowDown/Enter; Escape on failed match).
- `src/lib/saveicons.js` — floating 💾 buttons next to unmapped visible fields after a fill run; click saves current value under auto-key (`autoKey`: label → snake_case) + fingerprint mapping; one icon per radio group; MutationObserver rescan; Esc disables.
- `src/lib/storage.js` — `values` (key→value), `mappings` (fingerprint→key), `settings` in `chrome.storage.local`.
- `src/background.js` — restores from `data/backup.json` on install/startup when storage empty; debounced best-effort auto-backup to the linked file on storage changes.
- `src/lib/backup.js`, `src/fsBackup.js` — backup serialization; File System Access handle stored in IndexedDB (link once via Options, gesture required).
- Popup: Fill page / Show save icons / Auto-fill on load / Back up now. Options: values+mappings tables, export/import, link backup file.

## Key learnings (live-tested 2026-07-23 on Anthropic Greenhouse + Linear/Ramp Ashby)
- Greenhouse dropdowns = react-select `input[role=combobox]`; classify as dropdown, type-to-filter, click option.
- Ashby comboboxes ignore synthetic clicks — commit via ArrowDown/Enter keyed off `aria-activedescendant`; label is a sibling `<label>` in `_fieldEntry` wrapper (input has no id; placeholder is "Start typing...").
- Ashby location search returns nothing for full display text — shorten query at commas.
- `aria-expanded=true` after fill = uncommitted; don't count as filled.
- Chrome ≥137 branded ignores `--load-extension`; use Chrome for Testing for automated runs. `chrome.runtime.reload()` kills command-line-loaded extensions — restart the browser instead.
- Cross-site reuse works: `email|text` saved on Greenhouse fills Ashby's Email.

## Testing
- `npm test` — 51 node:test + jsdom tests.
- Live: scratchpad `drive.mjs` (playwright-core over CDP + raw-CDP service-worker eval) drives Chrome for Testing with the extension loaded.

## Never commit
`key.pem` (extension ID private key), `data/backup.json` (personal EEO answers). Both gitignored.
