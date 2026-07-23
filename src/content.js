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

  const teach = teachController(document, store, async (el, valueKey, value) => {
    const state = { values: await store.getValues(), mappings: await store.getMappings() };
    await fillPage(document, state);
  });
  window.__appfillerStartTeach = () => teach.start();
  window.__appfillerStopTeach = () => teach.stop();
}
