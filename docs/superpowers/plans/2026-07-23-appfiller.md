# AppFiller Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Manifest V3 Chrome extension that fills job-application fields (EEO/diversity + arbitrary data like LinkedIn/GitHub) from user-taught mappings, working across Ashby/Greenhouse/Lever including custom dropdowns.

**Architecture:** Three pure-JS libs (`fingerprint`, `fillers`, `storage`) hold the testable logic; `content.js` is thin DOM glue that scans the page, calls the libs, and renders teach-mode UI. Popup and options pages talk to the content script via `chrome.tabs.sendMessage` and read/write `chrome.storage.local`. No background service worker.

**Tech Stack:** Vanilla JS (ES modules), Chrome Extension Manifest V3, Node's built-in `node:test` + `jsdom` for unit tests.

## Global Constraints

- Manifest V3 only. `permissions: ["storage", "activeTab", "scripting"]`, `host_permissions`/`content_scripts` matches `<all_urls>`.
- Storage: `chrome.storage.local` exclusively. Three top-level keys: `values` (object key→string), `mappings` (object fingerprint→valueKey), `settings` (object, holds `autoFillOnLoad: boolean`).
- Fingerprint format: `normalize(labelText) + "|" + fieldType`. `fieldType` ∈ `{text, textarea, select, radio, checkbox, dropdown}`.
- `normalize`: lowercase, trim, collapse internal whitespace to single spaces, strip trailing `*` and punctuation.
- All synthetic DOM events use `{ bubbles: true }` and real event constructors so React registers them.
- Value→option matching is case-insensitive substring (`optionText.toLowerCase().includes(value.toLowerCase())`).
- Libs in `src/lib/*.js` must be import-testable in Node (no `chrome`/`window` at module top level; DOM passed in as arguments).

---

## Task 1: Project scaffold + manifest + test tooling

**Files:**
- Create: `appfiller/manifest.json`
- Create: `appfiller/package.json`
- Create: `appfiller/icons/README.md` (placeholder note; real PNGs added in Task 8)
- Create: `appfiller/.gitignore`
- Test: `appfiller/test/smoke.test.mjs`

**Interfaces:**
- Produces: `npm test` runs `node --test`; `manifest.json` referencing `src/content.js`, `src/content.css`, `src/popup.html`, `src/options.html`.

- [ ] **Step 1: Write the failing smoke test**

`test/smoke.test.mjs`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('manifest is valid MV3', () => {
  const m = JSON.parse(readFileSync(new URL('../manifest.json', import.meta.url)));
  assert.equal(m.manifest_version, 3);
  assert.deepEqual(m.permissions.sort(), ['activeTab', 'scripting', 'storage']);
  assert.ok(m.content_scripts[0].matches.includes('<all_urls>'));
  assert.equal(m.action.default_popup, 'src/popup.html');
  assert.equal(m.options_page, 'src/options.html');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd appfiller && node --test test/smoke.test.mjs`
Expected: FAIL — cannot find `../manifest.json`.

- [ ] **Step 3: Create the files**

`package.json`:
```json
{
  "name": "appfiller",
  "version": "0.1.0",
  "type": "module",
  "private": true,
  "scripts": { "test": "node --test" },
  "devDependencies": { "jsdom": "^24.0.0" }
}
```

`manifest.json`:
```json
{
  "manifest_version": 3,
  "name": "AppFiller",
  "version": "0.1.0",
  "description": "Teach-once auto-fill for job application fields (EEO/diversity + custom data).",
  "permissions": ["storage", "activeTab", "scripting"],
  "action": { "default_popup": "src/popup.html", "default_title": "AppFiller" },
  "options_page": "src/options.html",
  "content_scripts": [
    {
      "matches": ["<all_urls>"],
      "js": ["src/content.js"],
      "css": ["src/content.css"],
      "run_at": "document_idle"
    }
  ],
  "icons": { "16": "icons/icon16.png", "48": "icons/icon48.png", "128": "icons/icon128.png" }
}
```

`.gitignore`:
```
node_modules/
```

`icons/README.md`:
```
Placeholder. Real icon16/48/128.png added in Task 8.
```

- [ ] **Step 4: Install deps and run test to verify it passes**

Run: `cd appfiller && npm install && node --test test/smoke.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add appfiller/manifest.json appfiller/package.json appfiller/.gitignore appfiller/icons/README.md appfiller/test/smoke.test.mjs appfiller/package-lock.json
git commit -m "feat: scaffold MV3 manifest and node:test tooling"
```

---

## Task 2: `storage.js` — values/mappings/settings accessors

**Files:**
- Create: `appfiller/src/lib/storage.js`
- Test: `appfiller/test/storage.test.mjs`

**Interfaces:**
- Consumes: a storage backend object `{ get(keys), set(obj) }` (injected; wraps `chrome.storage.local` in production).
- Produces:
  - `createStore(backend)` → returns an object with:
    - `getValues(): Promise<Object>` (defaults `{}`)
    - `setValue(key, value): Promise<void>`
    - `deleteValue(key): Promise<void>`
    - `getMappings(): Promise<Object>`
    - `setMapping(fingerprint, valueKey): Promise<void>`
    - `deleteMapping(fingerprint): Promise<void>`
    - `getSettings(): Promise<{autoFillOnLoad: boolean}>` (default `{autoFillOnLoad:false}`)
    - `setSetting(key, value): Promise<void>`

- [ ] **Step 1: Write the failing test**

`test/storage.test.mjs`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../src/lib/storage.js';

function fakeBackend(initial = {}) {
  let data = { ...initial };
  return {
    async get(keys) {
      const out = {};
      for (const k of [].concat(keys)) if (k in data) out[k] = data[k];
      return out;
    },
    async set(obj) { data = { ...data, ...obj }; },
    _data: () => data,
  };
}

test('values round-trip and delete', async () => {
  const b = fakeBackend();
  const s = createStore(b);
  assert.deepEqual(await s.getValues(), {});
  await s.setValue('gender', 'Male');
  await s.setValue('linkedin', 'https://x');
  assert.deepEqual(await s.getValues(), { gender: 'Male', linkedin: 'https://x' });
  await s.deleteValue('gender');
  assert.deepEqual(await s.getValues(), { linkedin: 'https://x' });
});

test('mappings round-trip and delete', async () => {
  const s = createStore(fakeBackend());
  await s.setMapping('gender|select', 'gender');
  assert.deepEqual(await s.getMappings(), { 'gender|select': 'gender' });
  await s.deleteMapping('gender|select');
  assert.deepEqual(await s.getMappings(), {});
});

test('settings default and set', async () => {
  const s = createStore(fakeBackend());
  assert.deepEqual(await s.getSettings(), { autoFillOnLoad: false });
  await s.setSetting('autoFillOnLoad', true);
  assert.deepEqual(await s.getSettings(), { autoFillOnLoad: true });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd appfiller && node --test test/storage.test.mjs`
Expected: FAIL — cannot find `../src/lib/storage.js`.

- [ ] **Step 3: Write minimal implementation**

`src/lib/storage.js`:
```js
export function createStore(backend) {
  const read = async (key, fallback) => {
    const got = await backend.get(key);
    return key in got ? got[key] : fallback;
  };
  return {
    async getValues() { return read('values', {}); },
    async setValue(k, v) {
      const values = await this.getValues();
      values[k] = v;
      await backend.set({ values });
    },
    async deleteValue(k) {
      const values = await this.getValues();
      delete values[k];
      await backend.set({ values });
    },
    async getMappings() { return read('mappings', {}); },
    async setMapping(fp, valueKey) {
      const mappings = await this.getMappings();
      mappings[fp] = valueKey;
      await backend.set({ mappings });
    },
    async deleteMapping(fp) {
      const mappings = await this.getMappings();
      delete mappings[fp];
      await backend.set({ mappings });
    },
    async getSettings() {
      return { autoFillOnLoad: false, ...(await read('settings', {})) };
    },
    async setSetting(k, v) {
      const settings = await this.getSettings();
      settings[k] = v;
      await backend.set({ settings });
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd appfiller && node --test test/storage.test.mjs`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add appfiller/src/lib/storage.js appfiller/test/storage.test.mjs
git commit -m "feat: storage accessors for values/mappings/settings"
```

---

## Task 3: `fingerprint.js` — label resolution + normalize + fieldType

**Files:**
- Create: `appfiller/src/lib/fingerprint.js`
- Test: `appfiller/test/fingerprint.test.mjs`

**Interfaces:**
- Consumes: a DOM `Element` (the fillable control) — tests pass jsdom elements.
- Produces:
  - `normalize(text: string): string`
  - `getFieldType(el: Element): 'text'|'textarea'|'select'|'radio'|'checkbox'|'dropdown'`
  - `getLabelText(el: Element): string`
  - `fingerprint(el: Element): string` → `normalize(getLabelText(el)) + '|' + getFieldType(el)`

- [ ] **Step 1: Write the failing test**

`test/fingerprint.test.mjs`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { normalize, getFieldType, getLabelText, fingerprint } from '../src/lib/fingerprint.js';

function dom(html) { return new JSDOM(`<body>${html}</body>`).window.document; }

test('normalize lowercases, collapses ws, strips trailing * and punctuation', () => {
  assert.equal(normalize('  LinkedIn   Profile *'), 'linkedin profile');
  assert.equal(normalize('Are you Hispanic/Latino?'), 'are you hispanic/latino');
});

test('getFieldType detects native types', () => {
  const d = dom(`
    <input id="t" type="text">
    <textarea id="ta"></textarea>
    <select id="s"></select>
    <input id="r" type="radio">
    <input id="c" type="checkbox">
    <div id="dd" role="combobox"></div>`);
  assert.equal(getFieldType(d.getElementById('t')), 'text');
  assert.equal(getFieldType(d.getElementById('ta')), 'textarea');
  assert.equal(getFieldType(d.getElementById('s')), 'select');
  assert.equal(getFieldType(d.getElementById('r')), 'radio');
  assert.equal(getFieldType(d.getElementById('c')), 'checkbox');
  assert.equal(getFieldType(d.getElementById('dd')), 'dropdown');
});

test('getLabelText prefers aria-label, then <label for>, then legend', () => {
  const d1 = dom(`<input id="a" aria-label="GitHub URL">`);
  assert.equal(getLabelText(d1.getElementById('a')), 'GitHub URL');

  const d2 = dom(`<label for="b">LinkedIn Profile</label><input id="b">`);
  assert.equal(getLabelText(d2.getElementById('b')), 'LinkedIn Profile');

  const d3 = dom(`<fieldset><legend>Gender</legend><input id="c" type="radio"></fieldset>`);
  assert.equal(getLabelText(d3.getElementById('c')), 'Gender');

  const d4 = dom(`<label>Wrapped Q<input id="d"></label>`);
  assert.equal(getLabelText(d4.getElementById('d')), 'Wrapped Q');
});

test('fingerprint combines label and type', () => {
  const d = dom(`<label for="g">Gender</label><select id="g"></select>`);
  assert.equal(fingerprint(d.getElementById('g')), 'gender|select');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd appfiller && node --test test/fingerprint.test.mjs`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Write minimal implementation**

`src/lib/fingerprint.js`:
```js
export function normalize(text) {
  return (text || '')
    .toLowerCase()
    .replace(/[\s ]+/g, ' ')
    .trim()
    .replace(/[\s*.:?!,;]+$/g, '')
    .trim();
}

export function getFieldType(el) {
  const tag = el.tagName.toLowerCase();
  if (tag === 'textarea') return 'textarea';
  if (tag === 'select') return 'select';
  if (tag === 'input') {
    const t = (el.getAttribute('type') || 'text').toLowerCase();
    if (t === 'radio') return 'radio';
    if (t === 'checkbox') return 'checkbox';
    return 'text';
  }
  return 'dropdown';
}

export function getLabelText(el) {
  const aria = el.getAttribute && el.getAttribute('aria-label');
  if (aria) return aria.trim();

  const doc = el.ownerDocument;
  const labelledby = el.getAttribute && el.getAttribute('aria-labelledby');
  if (labelledby) {
    const ref = doc.getElementById(labelledby);
    if (ref) return ref.textContent.trim();
  }

  if (el.id) {
    const forLabel = doc.querySelector(`label[for="${el.id}"]`);
    if (forLabel) return forLabel.textContent.trim();
  }

  const wrapping = el.closest && el.closest('label');
  if (wrapping) {
    const clone = wrapping.cloneNode(true);
    for (const c of clone.querySelectorAll('input,select,textarea')) c.remove();
    const txt = clone.textContent.trim();
    if (txt) return txt;
  }

  const legend = el.closest && el.closest('fieldset');
  if (legend) {
    const lg = legend.querySelector('legend');
    if (lg) return lg.textContent.trim();
  }

  const ph = el.getAttribute && el.getAttribute('placeholder');
  if (ph) return ph.trim();

  const name = el.getAttribute && el.getAttribute('name');
  return name ? name.trim() : '';
}

export function fingerprint(el) {
  return normalize(getLabelText(el)) + '|' + getFieldType(el);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd appfiller && node --test test/fingerprint.test.mjs`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add appfiller/src/lib/fingerprint.js appfiller/test/fingerprint.test.mjs
git commit -m "feat: field fingerprinting (label resolution, normalize, type)"
```

---

## Task 4: `fillers.js` — native field fillers

**Files:**
- Create: `appfiller/src/lib/fillers.js`
- Test: `appfiller/test/fillers.test.mjs`

**Interfaces:**
- Consumes: DOM elements + a string value.
- Produces:
  - `setNativeValue(el, value): void` — text/textarea; sets value via prototype setter + dispatches `input`+`change`.
  - `fillSelect(selectEl, value): boolean` — picks first option whose text includes value; dispatches `change`; returns success.
  - `fillRadio(radioEl, value): boolean` — selects the radio in the group whose label text includes value; returns success.
  - `fillCheckbox(el, value): boolean` — checks when value is affirmative (`yes/true/on/checked/1` or non-empty non-negative), dispatches `click` if state changes.
  - `matchOptionText(candidates: string[], value): number` — returns index of first case-insensitive substring match, else -1.

- [ ] **Step 1: Write the failing test**

`test/fillers.test.mjs`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { setNativeValue, fillSelect, fillRadio, fillCheckbox, matchOptionText } from '../src/lib/fillers.js';

function win(html) {
  const dom = new JSDOM(`<body>${html}</body>`);
  return dom.window;
}

test('matchOptionText finds case-insensitive substring', () => {
  assert.equal(matchOptionText(['Female', 'Male', 'Decline'], 'male'), 1);
  assert.equal(matchOptionText(['A', 'B'], 'zzz'), -1);
});

test('setNativeValue sets value and fires input+change', () => {
  const w = win(`<input id="t" type="text">`);
  const el = w.document.getElementById('t');
  let events = [];
  el.addEventListener('input', () => events.push('input'));
  el.addEventListener('change', () => events.push('change'));
  setNativeValue(el, 'https://linkedin.com/in/joey');
  assert.equal(el.value, 'https://linkedin.com/in/joey');
  assert.deepEqual(events, ['input', 'change']);
});

test('fillSelect selects matching option', () => {
  const w = win(`<select id="s"><option>Female</option><option>Male</option></select>`);
  const el = w.document.getElementById('s');
  assert.equal(fillSelect(el, 'Male'), true);
  assert.equal(el.value, 'Male');
  assert.equal(fillSelect(el, 'nonexistent'), false);
});

test('fillRadio selects matching radio by label', () => {
  const w = win(`
    <fieldset>
      <label><input type="radio" name="hl" id="yes">Yes</label>
      <label><input type="radio" name="hl" id="no">No</label>
    </fieldset>`);
  const el = w.document.getElementById('yes');
  assert.equal(fillRadio(el, 'No'), true);
  assert.equal(w.document.getElementById('no').checked, true);
});

test('fillCheckbox checks on affirmative', () => {
  const w = win(`<input id="c" type="checkbox">`);
  const el = w.document.getElementById('c');
  assert.equal(fillCheckbox(el, 'yes'), true);
  assert.equal(el.checked, true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd appfiller && node --test test/fillers.test.mjs`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Write minimal implementation**

`src/lib/fillers.js`:
```js
export function matchOptionText(candidates, value) {
  const v = (value || '').toLowerCase();
  if (!v) return -1;
  for (let i = 0; i < candidates.length; i++) {
    if ((candidates[i] || '').toLowerCase().includes(v)) return i;
  }
  return -1;
}

function fire(el, type) {
  const win = el.ownerDocument.defaultView;
  const Ctor = type === 'input' ? win.InputEvent : win.Event;
  el.dispatchEvent(new Ctor(type, { bubbles: true }));
}

export function setNativeValue(el, value) {
  const win = el.ownerDocument.defaultView;
  const proto = el instanceof win.HTMLTextAreaElement
    ? win.HTMLTextAreaElement.prototype
    : win.HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
  setter.call(el, value);
  fire(el, 'input');
  fire(el, 'change');
}

export function fillSelect(selectEl, value) {
  const opts = Array.from(selectEl.options);
  const idx = matchOptionText(opts.map(o => o.textContent), value);
  if (idx === -1) return false;
  selectEl.selectedIndex = idx;
  fire(selectEl, 'change');
  return true;
}

function radioLabelText(radio) {
  const doc = radio.ownerDocument;
  if (radio.id) {
    const l = doc.querySelector(`label[for="${radio.id}"]`);
    if (l) return l.textContent.trim();
  }
  const wrap = radio.closest('label');
  if (wrap) {
    const clone = wrap.cloneNode(true);
    for (const c of clone.querySelectorAll('input')) c.remove();
    return clone.textContent.trim();
  }
  return radio.value || '';
}

export function fillRadio(radioEl, value) {
  const name = radioEl.getAttribute('name');
  const scope = name
    ? radioEl.ownerDocument.querySelectorAll(`input[type="radio"][name="${name}"]`)
    : [radioEl];
  const arr = Array.from(scope);
  const idx = matchOptionText(arr.map(radioLabelText), value);
  if (idx === -1) return false;
  arr[idx].click();
  return true;
}

export function fillCheckbox(el, value) {
  const v = (value || '').toString().toLowerCase().trim();
  const affirmative = ['yes', 'true', 'on', 'checked', '1'].includes(v)
    || (v && !['no', 'false', 'off', '0'].includes(v));
  if (el.checked !== affirmative) el.click();
  return true;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd appfiller && node --test test/fillers.test.mjs`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add appfiller/src/lib/fillers.js appfiller/test/fillers.test.mjs
git commit -m "feat: native field fillers (text/select/radio/checkbox)"
```

---

## Task 5: `fillers.js` — custom dropdown filler (Ashby/react-select)

**Files:**
- Modify: `appfiller/src/lib/fillers.js`
- Test: `appfiller/test/dropdown.test.mjs`

**Interfaces:**
- Consumes: a custom-dropdown control element + value; a `wait(ms)` injectable (defaults to real timers) for testability.
- Produces:
  - `findOptions(doc): Element[]` — returns visible option elements (`[role="option"]`, or `[class*="option"]` inside an open menu).
  - `fillDropdown(controlEl, value, { openAndWait }): Promise<boolean>` — opens the control, gets options via `openAndWait` (injected; in prod it clicks + polls), matches by text, clicks the option. Returns success.
  - `realClick(el): void` — dispatches `pointerdown`+`mousedown`+`mouseup`+`click`, all bubbling.

- [ ] **Step 1: Write the failing test**

`test/dropdown.test.mjs`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { findOptions, fillDropdown, realClick } from '../src/lib/fillers.js';

// Mimics an Ashby/react-select control: clicking the control renders a listbox.
function ashbyDom() {
  const dom = new JSDOM(`<body>
    <div id="ctrl" role="combobox" aria-haspopup="listbox"><span>Select...</span></div>
    <div id="menu"></div>
  </body>`);
  const doc = dom.window.document;
  const ctrl = doc.getElementById('ctrl');
  const menu = doc.getElementById('menu');
  ctrl.addEventListener('click', () => {
    menu.innerHTML = `
      <div role="option">Asian</div>
      <div role="option">Black or African American</div>
      <div role="option">White</div>`;
  });
  // Clicking an option writes the chosen text back into the control.
  menu.addEventListener('click', (e) => {
    if (e.target.getAttribute('role') === 'option') {
      ctrl.querySelector('span').textContent = e.target.textContent;
    }
  });
  return dom.window;
}

test('realClick fires a bubbling click', () => {
  const w = new JSDOM(`<body><button id="b"></button></body>`).window;
  const el = w.document.getElementById('b');
  let clicked = false;
  el.addEventListener('click', () => { clicked = true; });
  realClick(el);
  assert.equal(clicked, true);
});

test('findOptions returns role=option elements', () => {
  const w = ashbyDom();
  w.document.getElementById('ctrl').click();
  const opts = findOptions(w.document);
  assert.equal(opts.length, 3);
});

test('fillDropdown opens, matches, and selects the option', async () => {
  const w = ashbyDom();
  const ctrl = w.document.getElementById('ctrl');
  const openAndWait = async (el) => { realClick(el); return findOptions(el.ownerDocument); };
  const ok = await fillDropdown(ctrl, 'Asian', { openAndWait });
  assert.equal(ok, true);
  assert.equal(ctrl.querySelector('span').textContent, 'Asian');
});

test('fillDropdown returns false when no option matches', async () => {
  const w = ashbyDom();
  const ctrl = w.document.getElementById('ctrl');
  const openAndWait = async (el) => { realClick(el); return findOptions(el.ownerDocument); };
  assert.equal(await fillDropdown(ctrl, 'Martian', { openAndWait }), false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd appfiller && node --test test/dropdown.test.mjs`
Expected: FAIL — `findOptions`/`fillDropdown`/`realClick` not exported.

- [ ] **Step 3: Append implementation to `src/lib/fillers.js`**

```js
export function realClick(el) {
  const win = el.ownerDocument.defaultView;
  for (const type of ['pointerdown', 'mousedown', 'mouseup', 'click']) {
    const Ctor = win.MouseEvent || win.Event;
    el.dispatchEvent(new Ctor(type, { bubbles: true, cancelable: true }));
  }
}

export function findOptions(doc) {
  let opts = Array.from(doc.querySelectorAll('[role="option"]'));
  if (opts.length === 0) {
    opts = Array.from(doc.querySelectorAll('[class*="option"], [class*="Option"]'))
      .filter(o => o.offsetParent !== null || o.getClientRects().length > 0);
  }
  return opts;
}

export async function fillDropdown(controlEl, value, { openAndWait }) {
  const options = await openAndWait(controlEl);
  const idx = matchOptionText(options.map(o => o.textContent), value);
  if (idx === -1) return false;
  realClick(options[idx]);
  return true;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd appfiller && node --test test/dropdown.test.mjs`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add appfiller/src/lib/fillers.js appfiller/test/dropdown.test.mjs
git commit -m "feat: custom dropdown filler (Ashby/react-select listbox)"
```

---

## Task 6: `content.js` — scan, fill orchestration, message handling

**Files:**
- Create: `appfiller/src/content.js`
- Create: `appfiller/src/content.css`
- Test: `appfiller/test/content.test.mjs`

**Interfaces:**
- Consumes: `fingerprint` (Task 3); `setNativeValue`, `fillSelect`, `fillRadio`, `fillCheckbox`, `fillDropdown`, `findOptions`, `realClick` (Tasks 4–5); `createStore` (Task 2).
- Produces (exported for tests; also wired to `chrome` at runtime):
  - `collectFields(doc): Element[]` — all fillable controls: `input` (text/email/url/radio/checkbox), `textarea`, `select`, and custom-dropdown controls (`[role="combobox"]`, `[aria-haspopup="listbox"]`, `[class*="select__control"]`). Excludes hidden/submit/button inputs.
  - `fillPage(doc, { values, mappings }, deps): Promise<{filled:number, total:number}>` — for each field: fingerprint → mapping → value → dispatch to the right filler. `deps` injects the filler set + an `openAndWait`.
  - `openAndWaitReal(controlEl, wait): Promise<Element[]>` — clicks control, polls `findOptions` up to ~1.5s.

- [ ] **Step 1: Write the failing test**

`test/content.test.mjs`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { collectFields, fillPage } from '../src/content.js';
import { setNativeValue, fillSelect, fillRadio, fillCheckbox, fillDropdown, findOptions, realClick } from '../src/lib/fillers.js';

function harnessWindow() {
  const dom = new JSDOM(`<body>
    <label for="li">LinkedIn Profile</label><input id="li" type="url">
    <label for="gn">Gender</label>
    <select id="gn"><option>Select</option><option>Male</option><option>Female</option></select>
    <fieldset><legend>Are you Hispanic/Latino?</legend>
      <label><input type="radio" name="hl" id="hy">Yes</label>
      <label><input type="radio" name="hl" id="hn">No</label>
    </fieldset>
    <input id="ignore" type="submit">
  </body>`);
  return dom.window;
}

const deps = { setNativeValue, fillSelect, fillRadio, fillCheckbox, fillDropdown, findOptions, realClick,
  openAndWait: async (el) => { realClick(el); return findOptions(el.ownerDocument); } };

test('collectFields excludes submit/button', () => {
  const w = harnessWindow();
  const fields = collectFields(w.document);
  assert.ok(fields.every(f => f.id !== 'ignore'));
  assert.equal(fields.length, 4); // url, select, 2 radios
});

test('fillPage fills text, select, radio from mappings', async () => {
  const w = harnessWindow();
  const state = {
    values: { linkedin: 'https://linkedin.com/in/joey', gender: 'Male', race: 'No' },
    mappings: {
      'linkedin profile|text': 'linkedin',
      'gender|select': 'gender',
      'are you hispanic/latino|radio': 'race',
    },
  };
  const res = await fillPage(w.document, state, deps);
  assert.equal(w.document.getElementById('li').value, 'https://linkedin.com/in/joey');
  assert.equal(w.document.getElementById('gn').value, 'Male');
  assert.equal(w.document.getElementById('hn').checked, true);
  assert.equal(res.filled, 3);
});
```

Note: url `<input>` fingerprints as type `text`; the mapping key uses `|text` to match.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd appfiller && node --test test/content.test.mjs`
Expected: FAIL — cannot find `../src/content.js`.

- [ ] **Step 3: Write implementation**

`src/content.js`:
```js
import { fingerprint, getFieldType } from './lib/fingerprint.js';
import * as F from './lib/fillers.js';
import { createStore } from './lib/storage.js';

const DROPDOWN_SELECTOR = '[role="combobox"],[aria-haspopup="listbox"],[class*="select__control"]';

export function collectFields(doc) {
  const out = [];
  const seen = new Set();
  for (const el of doc.querySelectorAll('input,textarea,select')) {
    const type = (el.getAttribute('type') || 'text').toLowerCase();
    if (el.tagName === 'INPUT' && ['submit', 'button', 'hidden', 'file', 'image', 'reset', 'password'].includes(type)) continue;
    if (el.disabled) continue;
    out.push(el); seen.add(el);
  }
  for (const el of doc.querySelectorAll(DROPDOWN_SELECTOR)) {
    if (seen.has(el)) continue;
    out.push(el);
  }
  return out;
}

export async function openAndWaitReal(controlEl, wait = (ms) => new Promise(r => setTimeout(r, ms))) {
  F.realClick(controlEl);
  const deadline = Date.now() + 1500;
  let opts = F.findOptions(controlEl.ownerDocument);
  while (opts.length === 0 && Date.now() < deadline) {
    await wait(100);
    opts = F.findOptions(controlEl.ownerDocument);
  }
  return opts;
}

export async function fillPage(doc, state, deps = F) {
  const { values, mappings } = state;
  const openAndWait = deps.openAndWait || ((el) => openAndWaitReal(el));
  let filled = 0;
  const fields = collectFields(doc);
  for (const el of fields) {
    const fp = fingerprint(el);
    const valueKey = mappings[fp];
    if (!valueKey || !(valueKey in values)) continue;
    const value = values[valueKey];
    const type = getFieldType(el);
    let ok = false;
    if (type === 'text' || type === 'textarea') { deps.setNativeValue(el, value); ok = true; }
    else if (type === 'select') ok = deps.fillSelect(el, value);
    else if (type === 'radio') ok = deps.fillRadio(el, value);
    else if (type === 'checkbox') ok = deps.fillCheckbox(el, value);
    else if (type === 'dropdown') ok = await deps.fillDropdown(el, value, { openAndWait });
    if (ok) filled++;
  }
  return { filled, total: fields.length };
}

// --- Runtime wiring (skipped under node:test where `chrome` is undefined) ---
if (typeof chrome !== 'undefined' && chrome.storage) {
  const store = createStore({
    get: (k) => chrome.storage.local.get(k),
    set: (o) => chrome.storage.local.set(o),
  });

  async function runFill() {
    const [values, mappings] = await Promise.all([store.getValues(), store.getMappings()]);
    return fillPage(document, { values, mappings });
  }

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.action === 'fillPage') { runFill().then(sendResponse); return true; }
    if (msg.action === 'startTeach') { window.__appfillerStartTeach?.(); sendResponse({ ok: true }); return false; }
    if (msg.action === 'stopTeach') { window.__appfillerStopTeach?.(); sendResponse({ ok: true }); return false; }
  });

  store.getSettings().then(s => { if (s.autoFillOnLoad) runFill(); });
}
```

`src/content.css`:
```css
.appfiller-highlight { outline: 2px solid #2563eb !important; outline-offset: 1px !important; cursor: crosshair !important; }
.appfiller-panel { position: absolute; z-index: 2147483647; background: #fff; color: #111; border: 1px solid #2563eb; border-radius: 8px; padding: 10px; font: 13px/1.4 system-ui, sans-serif; box-shadow: 0 4px 16px rgba(0,0,0,.2); width: 260px; }
.appfiller-panel label { display: block; margin: 6px 0 2px; font-weight: 600; }
.appfiller-panel select, .appfiller-panel input { width: 100%; box-sizing: border-box; margin-bottom: 6px; }
.appfiller-panel .row { display: flex; gap: 6px; }
.appfiller-panel button { flex: 1; padding: 6px; border: 0; border-radius: 6px; cursor: pointer; }
.appfiller-panel .primary { background: #2563eb; color: #fff; }
.appfiller-panel .muted { font-size: 11px; color: #555; word-break: break-word; }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd appfiller && node --test test/content.test.mjs`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add appfiller/src/content.js appfiller/src/content.css appfiller/test/content.test.mjs
git commit -m "feat: content script field scan + fill orchestration"
```

---

## Task 7: Teach mode overlay UI

**Files:**
- Modify: `appfiller/src/content.js`
- Test: `appfiller/test/teach.test.mjs`

**Interfaces:**
- Consumes: `fingerprint`, `getLabelText` (Task 3); `createStore` (Task 2).
- Produces:
  - `buildTeachPanel(doc, { labelText, valueKeys }): HTMLElement` — a panel element with: a `<select class="af-key">` populated from `valueKeys` plus a `__new__` "Create new…" option, hidden `<input class="af-newkey">`/`<input class="af-newval">` shown when `__new__` is chosen, and `.af-save`/`.af-cancel` buttons. Shows `labelText` in a `.muted` node.
  - `teachController(doc, store, onTaught)` → `{ start(): void, stop(): void }`. `start` adds hover-highlight + click-capture; on field click it renders the panel; on save it computes `fingerprint(el)`, persists mapping (and new value if any) via `store`, calls `onTaught(el, valueKey, value)`, and removes the panel.

- [ ] **Step 1: Write the failing test**

`test/teach.test.mjs`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { buildTeachPanel, teachController } from '../src/content.js';

function fakeStore(values = {}, mappings = {}) {
  return {
    async getValues() { return { ...values }; },
    async getMappings() { return { ...mappings }; },
    async setValue(k, v) { values[k] = v; },
    async setMapping(fp, vk) { mappings[fp] = vk; },
    _values: values, _mappings: mappings,
  };
}

test('buildTeachPanel lists existing keys + create-new', () => {
  const doc = new JSDOM('<body></body>').window.document;
  const panel = buildTeachPanel(doc, { labelText: 'Gender', valueKeys: ['gender', 'linkedin'] });
  const opts = Array.from(panel.querySelectorAll('.af-key option')).map(o => o.value);
  assert.deepEqual(opts, ['gender', 'linkedin', '__new__']);
  assert.match(panel.textContent, /Gender/);
});

test('teachController saves mapping to existing key on field click + save', async () => {
  const w = new JSDOM(`<body><label for="g">Gender</label><select id="g"><option>Male</option></select></body>`).window;
  // jsdom lacks layout; stub getBoundingClientRect so panel positioning works.
  w.HTMLElement.prototype.getBoundingClientRect = () => ({ top: 0, left: 0, bottom: 0, right: 0, width: 0, height: 0 });
  global.window = w; global.document = w.document;
  const store = fakeStore({ gender: 'Male' }, {});
  let taught = null;
  const ctrl = teachController(w.document, store, (el, vk) => { taught = vk; });
  ctrl.start();
  const field = w.document.getElementById('g');
  field.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  await new Promise(r => setTimeout(r, 0));
  const panel = w.document.querySelector('.appfiller-panel');
  assert.ok(panel, 'panel rendered');
  panel.querySelector('.af-key').value = 'gender';
  panel.querySelector('.af-save').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  await new Promise(r => setTimeout(r, 0));
  assert.equal(store._mappings['gender|select'], 'gender');
  assert.equal(taught, 'gender');
  ctrl.stop();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd appfiller && node --test test/teach.test.mjs`
Expected: FAIL — `buildTeachPanel`/`teachController` not exported.

- [ ] **Step 3: Append implementation to `src/content.js`** (before the runtime-wiring block)

```js
import { getLabelText } from './lib/fingerprint.js';

export function buildTeachPanel(doc, { labelText, valueKeys }) {
  const panel = doc.createElement('div');
  panel.className = 'appfiller-panel';
  const keyOptions = valueKeys.map(k => `<option value="${k}">${k}</option>`).join('') +
    `<option value="__new__">Create new…</option>`;
  panel.innerHTML = `
    <div class="muted">Field: ${labelText || '(no label found)'}</div>
    <label>What data goes here?</label>
    <select class="af-key">${keyOptions}</select>
    <input class="af-newkey" placeholder="new key (e.g. github)" style="display:none">
    <input class="af-newval" placeholder="value" style="display:none">
    <div class="row">
      <button class="af-save primary">Save & fill</button>
      <button class="af-cancel">Cancel</button>
    </div>`;
  const keySel = panel.querySelector('.af-key');
  const newKey = panel.querySelector('.af-newkey');
  const newVal = panel.querySelector('.af-newval');
  keySel.addEventListener('change', () => {
    const isNew = keySel.value === '__new__';
    newKey.style.display = isNew ? 'block' : 'none';
    newVal.style.display = isNew ? 'block' : 'none';
  });
  return panel;
}

export function teachController(doc, store, onTaught) {
  let current = null;
  let panel = null;

  const onOver = (e) => {
    const el = e.target;
    if (panel && panel.contains(el)) return;
    el.classList?.add('appfiller-highlight');
  };
  const onOut = (e) => { e.target.classList?.remove('appfiller-highlight'); };

  const onClick = async (e) => {
    const el = e.target;
    if (panel && panel.contains(el)) return;
    const field = el.closest('input,textarea,select,[role="combobox"],[aria-haspopup="listbox"],[class*="select__control"]');
    if (!field) return;
    e.preventDefault(); e.stopPropagation();
    current = field;
    removePanel();
    const valueKeys = Object.keys(await store.getValues());
    panel = buildTeachPanel(doc, { labelText: getLabelText(field), valueKeys });
    const rect = field.getBoundingClientRect();
    panel.style.top = (rect.bottom + doc.defaultView.scrollY + 4) + 'px';
    panel.style.left = (rect.left + doc.defaultView.scrollX) + 'px';
    doc.body.appendChild(panel);
    panel.querySelector('.af-cancel').addEventListener('click', removePanel);
    panel.querySelector('.af-save').addEventListener('click', save);
  };

  async function save() {
    const keySel = panel.querySelector('.af-key');
    let valueKey = keySel.value;
    if (valueKey === '__new__') {
      valueKey = panel.querySelector('.af-newkey').value.trim();
      const val = panel.querySelector('.af-newval').value;
      if (!valueKey) return;
      await store.setValue(valueKey, val);
    }
    await store.setMapping(fingerprint(current), valueKey);
    const value = (await store.getValues())[valueKey];
    onTaught?.(current, valueKey, value);
    removePanel();
  }

  function removePanel() { if (panel) { panel.remove(); panel = null; } }

  return {
    start() {
      doc.addEventListener('mouseover', onOver, true);
      doc.addEventListener('mouseout', onOut, true);
      doc.addEventListener('click', onClick, true);
    },
    stop() {
      doc.removeEventListener('mouseover', onOver, true);
      doc.removeEventListener('mouseout', onOut, true);
      doc.removeEventListener('click', onClick, true);
      removePanel();
    },
  };
}
```

Then in the runtime-wiring block, wire teach mode and immediate-fill-on-taught:
```js
  const teach = teachController(document, store, async (el, valueKey, value) => {
    const state = { values: await store.getValues(), mappings: await store.getMappings() };
    await fillPage(document, state);
  });
  window.__appfillerStartTeach = () => teach.start();
  window.__appfillerStopTeach = () => teach.stop();
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd appfiller && node --test test/teach.test.mjs`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add appfiller/src/content.js appfiller/test/teach.test.mjs
git commit -m "feat: teach-mode overlay UI + mapping capture"
```

---

## Task 8: Popup, options page, icons, manual test harness

**Files:**
- Create: `appfiller/src/popup.html`, `appfiller/src/popup.js`
- Create: `appfiller/src/options.html`, `appfiller/src/options.js`
- Create: `appfiller/icons/icon16.png`, `icon48.png`, `icon128.png`
- Create: `appfiller/test/harness.html`
- Create: `appfiller/README.md`

**Interfaces:**
- Consumes: content-script message actions `fillPage`/`startTeach`/`stopTeach` (Task 6–7); `chrome.storage.local` keys `values`/`mappings`/`settings`.
- Produces: user-facing UI. No unit test (browser-glue) — verified manually via the harness.

- [ ] **Step 1: Create popup**

`src/popup.html`:
```html
<!doctype html><meta charset="utf-8">
<link rel="stylesheet" href="popup.css">
<body>
  <div class="wrap">
    <button id="fill" class="primary">Fill page</button>
    <button id="teach">Teach a field</button>
    <label class="chk"><input type="checkbox" id="auto"> Auto-fill on load</label>
    <a href="#" id="opts">Edit my data →</a>
  </div>
  <script src="popup.js"></script>
</body>
```

`src/popup.css`:
```css
body { margin: 0; }
.wrap { width: 200px; padding: 12px; font: 14px system-ui, sans-serif; display: flex; flex-direction: column; gap: 8px; }
button { padding: 8px; border: 1px solid #ccc; border-radius: 6px; cursor: pointer; background: #f5f5f5; }
button.primary { background: #2563eb; color: #fff; border-color: #2563eb; }
button.active { background: #dc2626; color: #fff; border-color: #dc2626; }
.chk { font-size: 12px; display: flex; align-items: center; gap: 6px; }
a { font-size: 12px; color: #2563eb; }
```

`src/popup.js`:
```js
const $ = (id) => document.getElementById(id);
let teaching = false;

async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

$('fill').addEventListener('click', async () => {
  const tab = await activeTab();
  const res = await chrome.tabs.sendMessage(tab.id, { action: 'fillPage' });
  $('fill').textContent = res ? `Filled ${res.filled}/${res.total}` : 'Fill page';
});

$('teach').addEventListener('click', async () => {
  const tab = await activeTab();
  teaching = !teaching;
  await chrome.tabs.sendMessage(tab.id, { action: teaching ? 'startTeach' : 'stopTeach' });
  $('teach').textContent = teaching ? 'Stop teaching' : 'Teach a field';
  $('teach').classList.toggle('active', teaching);
});

$('opts').addEventListener('click', (e) => { e.preventDefault(); chrome.runtime.openOptionsPage(); });

(async () => {
  const { settings = {} } = await chrome.storage.local.get('settings');
  $('auto').checked = !!settings.autoFillOnLoad;
})();
$('auto').addEventListener('change', async () => {
  const { settings = {} } = await chrome.storage.local.get('settings');
  settings.autoFillOnLoad = $('auto').checked;
  await chrome.storage.local.set({ settings });
});
```

- [ ] **Step 2: Create options page**

`src/options.html`:
```html
<!doctype html><meta charset="utf-8"><title>AppFiller — My Data</title>
<link rel="stylesheet" href="options.css">
<body>
  <h1>My Data</h1>
  <table id="values"><thead><tr><th>Key</th><th>Value</th><th></th></tr></thead><tbody></tbody></table>
  <div class="add"><input id="newkey" placeholder="key (e.g. gender)"><input id="newval" placeholder="value (e.g. Male)"><button id="add">Add</button></div>
  <h2>Learned field mappings</h2>
  <table id="maps"><thead><tr><th>Field (label|type)</th><th>→ Data key</th><th></th></tr></thead><tbody></tbody></table>
  <script src="options.js"></script>
</body>
```

`src/options.css`:
```css
body { font: 14px system-ui, sans-serif; margin: 24px; max-width: 640px; }
table { width: 100%; border-collapse: collapse; margin-bottom: 12px; }
th, td { text-align: left; padding: 6px 8px; border-bottom: 1px solid #eee; }
input { padding: 6px; }
.add { display: flex; gap: 8px; margin-bottom: 24px; }
button { padding: 6px 12px; cursor: pointer; }
td input { width: 100%; box-sizing: border-box; border: 1px solid transparent; }
td input:focus { border-color: #2563eb; }
```

`src/options.js`:
```js
const g = (k) => chrome.storage.local.get(k);
const s = (o) => chrome.storage.local.set(o);

async function renderValues() {
  const { values = {} } = await g('values');
  const tb = document.querySelector('#values tbody');
  tb.innerHTML = '';
  for (const [k, v] of Object.entries(values)) {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${k}</td><td><input value="${v.replace(/"/g,'&quot;')}"></td><td><button>✕</button></td>`;
    tr.querySelector('input').addEventListener('change', async (e) => {
      const { values = {} } = await g('values'); values[k] = e.target.value; await s({ values });
    });
    tr.querySelector('button').addEventListener('click', async () => {
      const { values = {} } = await g('values'); delete values[k]; await s({ values }); renderValues();
    });
    tb.appendChild(tr);
  }
}

async function renderMaps() {
  const { mappings = {} } = await g('mappings');
  const tb = document.querySelector('#maps tbody');
  tb.innerHTML = '';
  for (const [fp, vk] of Object.entries(mappings)) {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${fp}</td><td>${vk}</td><td><button>✕</button></td>`;
    tr.querySelector('button').addEventListener('click', async () => {
      const { mappings = {} } = await g('mappings'); delete mappings[fp]; await s({ mappings }); renderMaps();
    });
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

renderValues(); renderMaps();
```

- [ ] **Step 3: Create icons and harness**

Generate solid-blue placeholder PNGs:
```bash
cd appfiller
node -e '
const fs=require("fs");
// 1x1 blue PNG, base64
const b64="iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNk+M9QDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const buf=Buffer.from(b64,"base64");
for (const n of [16,48,128]) fs.writeFileSync(`icons/icon${n}.png`, buf);
console.log("icons written");
'
```
(Chrome scales the 1×1 to the requested size — fine for dev. Replace with real art later.)

`test/harness.html`:
```html
<!doctype html><meta charset="utf-8"><title>AppFiller Harness</title>
<style>
  body { font: 14px system-ui; margin: 24px; max-width: 520px; }
  label { display: block; margin: 14px 0 4px; font-weight: 600; }
  input, select { width: 100%; padding: 6px; box-sizing: border-box; }
  fieldset { margin: 14px 0; }
  /* Fake Ashby/react-select control */
  .rs { border: 1px solid #ccc; border-radius: 4px; padding: 8px; cursor: pointer; }
  .rs__menu { border: 1px solid #ccc; margin-top: 2px; display: none; }
  .rs__menu.open { display: block; }
  .select__option { padding: 8px; cursor: pointer; }
  .select__option:hover { background: #eef; }
</style>
<body>
  <h1>Application form (test)</h1>

  <label for="li">LinkedIn Profile</label>
  <input id="li" type="url">

  <label for="gh">GitHub</label>
  <input id="gh" type="url">

  <label for="gn">Gender</label>
  <select id="gn"><option>Select…</option><option>Male</option><option>Female</option><option>Decline to self-identify</option></select>

  <fieldset><legend>Are you Hispanic/Latino?</legend>
    <label style="font-weight:400"><input type="radio" name="hl"> Yes</label>
    <label style="font-weight:400"><input type="radio" name="hl"> No</label>
  </fieldset>

  <label id="race-lbl">Race/Ethnicity</label>
  <div class="rs" role="combobox" aria-haspopup="listbox" aria-labelledby="race-lbl">
    <span class="rs__value">Select…</span>
    <div class="rs__menu">
      <div class="select__option" role="option">Asian</div>
      <div class="select__option" role="option">Black or African American</div>
      <div class="select__option" role="option">White</div>
      <div class="select__option" role="option">Decline to self-identify</div>
    </div>
  </div>

  <script>
    // Minimal react-select-like behavior for manual testing.
    const rs = document.querySelector('.rs');
    const menu = rs.querySelector('.rs__menu');
    rs.addEventListener('click', (e) => {
      if (e.target.classList.contains('select__option')) {
        rs.querySelector('.rs__value').textContent = e.target.textContent;
        menu.classList.remove('open');
      } else { menu.classList.toggle('open'); }
    });
  </script>
</body>
```

`README.md`:
```markdown
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
```

- [ ] **Step 4: Verify unit suite still green + manual smoke**

Run: `cd appfiller && node --test`
Expected: PASS (all suites).

Manual (report result): load unpacked, open `test/harness.html`, add values, teach all fields incl. the Race/Ethnicity dropdown, reload, click Fill page → confirm all filled.

- [ ] **Step 5: Commit**

```bash
git add appfiller/src/popup.html appfiller/src/popup.css appfiller/src/popup.js appfiller/src/options.html appfiller/src/options.css appfiller/src/options.js appfiller/icons/icon16.png appfiller/icons/icon48.png appfiller/icons/icon128.png appfiller/test/harness.html appfiller/README.md
git commit -m "feat: popup, options page, icons, and manual test harness"
```

---

## Self-Review

**Spec coverage:**
- Two stores `values`/`mappings` + `settings` → Task 2. ✅
- Fingerprint = normalize(label)+type, label priority order → Task 3. ✅
- Fill per-type incl. React events → Task 4. ✅
- Custom dropdown (Ashby/react-select) first-class → Task 5 + harness in Task 8. ✅
- Content script scan + orchestration + auto-fill-on-load + messaging → Task 6. ✅
- Teach mode overlay → Task 7. ✅
- Popup (Fill / Teach / auto checkbox / options link) → Task 8. ✅
- Options page (edit values, list/delete mappings) → Task 8. ✅
- 3 components, no background worker → manifest Task 1, content Task 6. ✅
- Test harness with Ashby-style dropdown → Task 8. ✅

**Placeholder scan:** No TBD/TODO; every code step shows full code. Icons use a real generated PNG, not a placeholder path. ✅

**Type consistency:** `createStore` API used identically in Tasks 6–7 wiring. `fillPage(doc, state, deps)`, `collectFields(doc)`, `fingerprint(el)`, `getFieldType(el)`, `getLabelText(el)` signatures consistent across tasks. `openAndWait` injected in tests, defaulted in `fillPage`. ✅

**Note on `<all_urls>` teach click-capture:** teach mode uses capture-phase listeners and `preventDefault`/`stopPropagation` so clicking a field opens the panel instead of activating the field. Only active while teaching.
