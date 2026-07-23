# AppFiller — Chrome Extension Design

**Date:** 2026-07-23
**Status:** Approved for implementation

## Purpose

A Manifest V3 Chrome extension that auto-fills fields on job applications
(diversity/EEO questions — gender, LGBT status, race/ethnicity, veteran
status, disability status — plus arbitrary fields like LinkedIn, GitHub,
current company). The user "teaches" the extension what data belongs in a
field once; it then fills that field on every application that asks the same
question. Ashby is a primary target, alongside Greenhouse, Lever, and
Workday-style custom dropdowns.

## Core Model

Two stores in `chrome.storage.local`:

- **`values`** — the user's data as key→value pairs. Fully extensible.
  Example:
  ```json
  {
    "gender": "Male",
    "race": "Asian",
    "veteran": "I am not a veteran",
    "disability": "No, I do not have a disability",
    "lgbt": "Prefer not to say",
    "linkedin": "https://linkedin.com/in/joey",
    "github": "https://github.com/joey",
    "currentCompany": "Latitude AI"
  }
  ```
- **`mappings`** — learned field rules: `labelKey → valueKey`. Built entirely
  by teaching. No built-in heuristics, no guessing.
  Example:
  ```json
  {
    "gender|select": "gender",
    "linkedin profile|text": "linkedin",
    "are you hispanic or latino|radio": "race"
  }
  ```

Plus one setting: `autoFillOnLoad` (boolean).

## Matching Strategy (single rule)

A field is identified by a **fingerprint** = `normalize(labelText) + "|" + fieldType`.

- **labelText** is resolved in priority order:
  1. `aria-label` / `aria-labelledby` target text
  2. Associated `<label>` (via `for`/`id` or wrapping label)
  3. Nearest preceding heading/question text (fieldset `<legend>`, or nearest
     block text sibling above the control)
  4. `placeholder`, then `name`
- **normalize**: lowercase, trim, collapse whitespace, strip trailing
  punctuation and asterisks (`*`).
- **fieldType** ∈ `{text, textarea, select, radio, checkbox, dropdown}` where
  `dropdown` = custom (non-native) combobox.

Because the same question reads the same across companies and ATSes, teaching
once on one application makes the field fill on the next.

## Fill Behavior

For each fillable control found on the page:
1. Compute its fingerprint.
2. Look up `mappings[fingerprint]` → `valueKey`.
3. If found and `values[valueKey]` exists, fill it.

### Per-type fill

- **text / email / url / textarea** — set `.value` via the native setter, then
  dispatch `input` and `change` events (so React/controlled inputs register).
- **native `<select>`** — find `<option>` whose text case-insensitively
  contains the stored value; set `selectedIndex`; dispatch `change`.
- **radio group** — within the group (same `name` or fieldset), find the option
  whose label text matches the stored value; `.click()` it.
- **checkbox** — check if stored value is truthy/affirmative.
- **custom dropdown** — see below.

### Custom dropdown handling (first-class — Ashby/react-select/Workday)

A "dropdown" is a control that is not a native `<select>` but exposes a list on
interaction: `role="combobox"`, `role="button"` + `aria-haspopup="listbox"`, or
a react-select container.

Fill sequence:
1. `mousedown` + `click` the control to open the listbox.
2. Poll (short interval, capped timeout ~1.5s) for options to render
   (`role="option"`, or react-select `[class*="option"]`).
3. If the control has a text input, type the stored value to filter.
4. Find the option whose text case-insensitively contains the stored value.
5. `mousedown` + `click` that option.
6. Verify the control now displays the value; if not, retry once.

All synthetic events use `bubbles: true` and are real `MouseEvent`/`InputEvent`
instances so React's synthetic event system registers them.

## Teach Mode

1. User clicks **Teach a field** in the popup → content script enters teach
   mode: hovering any control highlights it with an outline.
2. User clicks a control → an overlay panel appears near it showing the detected
   label text, and asks *"What data goes here?"*:
   - a dropdown of existing `values` keys, **or**
   - "Create new" → enter a new key + value.
3. On confirm: save `mappings[fingerprint] = valueKey` (and the new value if
   created). Immediately fill the field as confirmation.
4. Teach mode stays on until toggled off, so several fields can be taught in a
   row.

## Components (3 — no background service worker)

1. **`popup.html` / `popup.js`** — `Fill page` button, `Teach a field` toggle,
   `Auto-fill on load` checkbox, link to Options. Sends messages to the active
   tab's content script.
2. **`options.html` / `options.js`** — editable table of `values`
   (add/edit/delete key-value rows); list of learned `mappings` with delete
   buttons.
3. **`content.js`** — injected on all pages (`<all_urls>`). Owns: field
   scanning, fingerprinting, filling (all types incl. custom dropdowns),
   teach-mode overlay UI, and self-running auto-fill on load when enabled.
   Paired with `content.css` for highlight/overlay styles.

Message passing: popup → `chrome.tabs.sendMessage(tabId, {action})`. Content
script reads/writes `chrome.storage.local` directly.

### File layout

```
appfiller/
  manifest.json
  src/
    content.js
    content.css
    popup.html
    popup.js
    options.html
    options.js
    lib/
      fingerprint.js   # label resolution + normalize + fieldType
      fillers.js       # per-type fill functions incl. custom dropdown
      storage.js       # get/set values, mappings, settings
  icons/               # 16/48/128 png
  test/
    harness.html       # Ashby-style dropdown + native select/radio/text/textarea
```

`lib/*` modules keep fingerprinting and filling independently testable and out
of the DOM-glue in `content.js`.

## manifest.json (shape)

- `manifest_version: 3`
- `permissions: ["storage", "activeTab", "scripting"]`
- `content_scripts`: `content.js` + `content.css` at `document_idle` on
  `<all_urls>`
- `action`: popup = `popup.html`
- `options_page`: `options.html`

## Testing

`test/harness.html` — a standalone page (no ATS access needed) reproducing:
- text + url inputs (LinkedIn/GitHub),
- a native `<select>` (gender),
- a radio group (Hispanic/Latino),
- a **custom react-select-style dropdown** mimicking Ashby (race/ethnicity),
- a textarea.

Verification steps:
1. Load unpacked extension.
2. Teach each field once via the harness; confirm mappings saved.
3. Reload harness; click **Fill page**; confirm every field — including the
   custom dropdown — fills correctly.
4. Duplicate the harness (different DOM ids, same labels); confirm fills still
   work (proves label-text generalization, not DOM-path).

## Non-Goals (YAGNI)

- No cloud sync / accounts (local storage only; `sync` deferred).
- No built-in EEO heuristics — everything is taught.
- No per-site scraper configs — one generic strategy.
- No auto-submit of applications.

## Risks

- **Custom dropdowns vary.** The combobox-open + option-match approach covers
  Ashby / react-select / most ARIA listboxes, but some bespoke widgets may need
  the retry path or a future per-widget tweak. Mitigated by the retry + verify
  step and the test harness.
- **Label ambiguity.** Two different questions could normalize to the same text
  on the same page (rare). Acceptable for v1; user can delete a bad mapping.
