import { fingerprint, getFieldType, getLabelText } from './lib/fingerprint.js';
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

// True when the control already holds the intended value. Lets repeat passes be
// idempotent — critical for dropdowns, where a redundant click would re-open the
// menu and leave it hanging open.
export function alreadyHasValue(el, type, value) {
  const v = (value || '').toLowerCase().trim();
  if (!v) return false;
  if (type === 'text' || type === 'textarea') {
    return (el.value || '').trim() === (value || '').trim();
  }
  if (type === 'select') {
    const opt = el.options[el.selectedIndex];
    return !!opt && opt.textContent.toLowerCase().trim() === v;
  }
  if (type === 'dropdown') {
    return (el.textContent || '').toLowerCase().includes(v);
  }
  // radio/checkbox fills are cheap and idempotent; always re-apply.
  return false;
}

export async function fillPage(doc, state, deps = F) {
  const { values, mappings } = state;
  const openAndWait = deps.openAndWait || ((el) => openAndWaitReal(el));
  let filled = 0;
  const fields = collectFields(doc);
  for (const el of fields) {
    try {
      const fp = fingerprint(el);
      const valueKey = mappings[fp];
      if (!valueKey || !(valueKey in values)) continue;
      const value = values[valueKey];
      const type = getFieldType(el);
      if (alreadyHasValue(el, type, value)) { filled++; continue; }
      let ok = false;
      if (type === 'text' || type === 'textarea') { deps.setNativeValue(el, value); ok = true; }
      else if (type === 'select') ok = deps.fillSelect(el, value);
      else if (type === 'radio') ok = deps.fillRadio(el, value);
      else if (type === 'checkbox') ok = deps.fillCheckbox(el, value);
      else if (type === 'dropdown') ok = await deps.fillDropdown(el, value, { openAndWait });
      if (ok) filled++;
    } catch (e) {
      console.warn('[AppFiller] failed to fill field', el, e);
    }
  }
  return { filled, total: fields.length };
}

// Auto-fill on load runs several passes. A single pass at document_idle often
// lands before a React/SPA form finishes mounting, and the app's first render
// then wipes what we wrote. Later passes restore it; alreadyHasValue keeps each
// pass idempotent so settled fields are left alone.
export async function autoFillWithRetries(doc, getState, opts = {}) {
  const delays = opts.delays || [0, 600, 1500, 3000];
  const wait = opts.wait || ((ms) => new Promise((r) => setTimeout(r, ms)));
  let last = { filled: 0, total: 0 };
  for (const d of delays) {
    await wait(d);
    last = await fillPage(doc, await getState(), opts.deps);
  }
  return last;
}

export function buildTeachPanel(doc, { labelText, valueKeys }) {
  const panel = doc.createElement('div');
  panel.className = 'appfiller-panel';
  panel.innerHTML = `
    <div class="muted">Field: </div>
    <label>What data goes here?</label>
    <select class="af-key"></select>
    <input class="af-newkey" placeholder="new key (e.g. github)" style="display:none">
    <input class="af-newval" placeholder="value" style="display:none">
    <div class="af-err" style="display:none"></div>
    <div class="row">
      <button type="button" class="af-save primary">Save &amp; fill</button>
      <button type="button" class="af-cancel">Cancel</button>
    </div>`;
  panel.querySelector('.muted').textContent = `Field: ${labelText || '(no label found)'}`;
  const keySel = panel.querySelector('.af-key');
  for (const k of valueKeys) {
    const option = doc.createElement('option');
    option.value = k;
    option.textContent = k;
    keySel.appendChild(option);
  }
  const newOption = doc.createElement('option');
  newOption.value = '__new__';
  newOption.textContent = 'Create new…';
  keySel.appendChild(newOption);
  const newKey = panel.querySelector('.af-newkey');
  const newVal = panel.querySelector('.af-newval');
  const syncNewFields = () => {
    const isNew = keySel.value === '__new__';
    newKey.style.display = isNew ? 'block' : 'none';
    newVal.style.display = isNew ? 'block' : 'none';
  };
  keySel.addEventListener('change', syncNewFields);
  // Reflect the INITIAL selection too. With no saved keys, "Create new…" is the
  // only option and is already selected, so `change` never fires — without this
  // the new key/value inputs would stay hidden and nothing could be created.
  syncNewFields();
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

  function showError(msg) {
    const err = panel.querySelector('.af-err');
    err.textContent = msg;
    err.style.display = 'block';
  }

  async function save() {
    const keySel = panel.querySelector('.af-key');
    let valueKey = keySel.value;
    if (valueKey === '__new__') {
      const keyInput = panel.querySelector('.af-newkey');
      valueKey = keyInput.value.trim();
      const val = panel.querySelector('.af-newval').value;
      if (!valueKey) {
        showError('Enter a key name (e.g. gender) before saving.');
        keyInput.focus();
        return;
      }
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

  store.getSettings().then(s => {
    if (!s.autoFillOnLoad) return;
    autoFillWithRetries(document, async () => ({
      values: await store.getValues(),
      mappings: await store.getMappings(),
    }));
  });

  const teach = teachController(document, store, async (el, valueKey, value) => {
    const state = { values: await store.getValues(), mappings: await store.getMappings() };
    await fillPage(document, state);
  });
  window.__appfillerStartTeach = () => teach.start();
  window.__appfillerStopTeach = () => teach.stop();
}
