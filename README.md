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
