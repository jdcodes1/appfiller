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
