import { fingerprint, getFieldType, isComboboxInput } from './lib/fingerprint.js';
import * as F from './lib/fillers.js';
import { createStore } from './lib/storage.js';
import { createSaveIcons } from './lib/saveicons.js';

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
    // A react-select control wrapping an already-collected combobox input is
    // the same field — the input is the canonical element.
    if (el.tagName !== 'INPUT' && el.querySelector && [...el.querySelectorAll('input')].some(i => seen.has(i))) continue;
    out.push(el);
  }
  return out;
}

export async function openAndWaitReal(controlEl, searchText, wait = (ms) => new Promise(r => setTimeout(r, ms))) {
  const doc = controlEl.ownerDocument;
  F.realClick(controlEl);
  if (controlEl.tagName === 'INPUT') {
    controlEl.focus();
    // Typing into the combobox filters long/async option lists (locations,
    // schools) down to something clickable.
    if (searchText) {
      try { F.setNativeValue(controlEl, searchText); } catch (e) { /* readonly comboboxes */ }
    }
  }
  const deadline = Date.now() + 2500;
  let opts = F.findOptions(doc, controlEl);
  while (opts.length === 0 && Date.now() < deadline) {
    await wait(100);
    opts = F.findOptions(doc, controlEl);
  }
  // Async-filtered lists repopulate after the first options appear; give them a
  // beat to settle, then re-read.
  if (opts.length > 0 && controlEl.tagName === 'INPUT' && searchText) {
    await wait(150);
    opts = F.findOptions(doc, controlEl);
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
    if (el.tagName === 'INPUT') {
      if ((el.value || '').toLowerCase().trim() === v) return true;
      const container = el.closest('[class*="select__control"]') || el.parentElement?.parentElement || el.parentElement;
      return !!container && (container.textContent || '').toLowerCase().includes(v);
    }
    return (el.textContent || '').toLowerCase().includes(v);
  }
  // radio/checkbox fills are cheap and idempotent; always re-apply.
  return false;
}

export async function fillPage(doc, state, deps = F) {
  const { values, mappings } = state;
  const openAndWait = deps.openAndWait || ((el, text) => openAndWaitReal(el, text));
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

// --- Runtime wiring (skipped under node:test where `chrome` is undefined) ---
if (typeof chrome !== 'undefined' && chrome.storage) {
  const store = createStore({
    get: (k) => chrome.storage.local.get(k),
    set: (o) => chrome.storage.local.set(o),
  });

  const saveIcons = createSaveIcons(document, store, { collectFields });

  async function runFill() {
    const [values, mappings] = await Promise.all([store.getValues(), store.getMappings()]);
    const res = await fillPage(document, { values, mappings });
    // After a fill run, surface save icons on everything we couldn't fill so
    // the user can bank those values with one click.
    await saveIcons.enable();
    return res;
  }

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.action === 'fillPage') { runFill().then(sendResponse); return true; }
    if (msg.action === 'showIcons') { saveIcons.enable().then(() => sendResponse({ ok: true, shown: true })); return true; }
    if (msg.action === 'hideIcons') { saveIcons.disable(); sendResponse({ ok: true, shown: false }); return false; }
    if (msg.action === 'iconsState') { sendResponse({ shown: saveIcons.isEnabled(), href: location.href }); return false; }
  });

  store.getSettings().then(async s => {
    if (!s.autoFillOnLoad) return;
    const res = await autoFillWithRetries(document, async () => ({
      values: await store.getValues(),
      mappings: await store.getMappings(),
    }));
    // Only auto-surface icons on pages that look like a form we care about —
    // either something filled, or there are several fillable fields.
    if (res.filled > 0 || res.total >= 3) await saveIcons.enable();
  });
}
