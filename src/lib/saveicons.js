import { fingerprint, getFieldType, getLabelText, normalize } from './fingerprint.js';

// Auto-generate a storage key from the field's label: "First Name *" -> "first_name".
export function autoKey(labelText) {
  return normalize(labelText)
    .replace(/\(optional\)|\(required\)/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48);
}

// Read what the user currently has in the field, as the text we'd want to
// replay later (option text for selects/dropdowns, label text for radios).
export function readCurrentValue(el, type) {
  if (type === 'text' || type === 'textarea') return (el.value || '').trim();
  if (type === 'select') {
    const opt = el.options[el.selectedIndex];
    if (!opt || !el.value) return '';
    return opt.textContent.trim();
  }
  if (type === 'radio') {
    const name = el.getAttribute('name');
    const doc = el.ownerDocument;
    const esc = (s) => (typeof CSS !== 'undefined' && CSS.escape) ? CSS.escape(s) : s;
    const group = name ? doc.querySelectorAll(`input[type="radio"][name="${esc(name)}"]`) : [el];
    for (const r of group) {
      if (!r.checked) continue;
      if (r.id) {
        const l = doc.querySelector(`label[for="${esc(r.id)}"]`);
        if (l) return l.textContent.trim();
      }
      const wrap = r.closest('label');
      if (wrap) {
        const clone = wrap.cloneNode(true);
        for (const c of clone.querySelectorAll('input')) c.remove();
        const txt = clone.textContent.trim();
        if (txt) return txt;
      }
      return r.value || '';
    }
    return '';
  }
  if (type === 'checkbox') return el.checked ? 'yes' : 'no';
  if (type === 'dropdown') {
    // Combobox input: the chosen value renders as text in the control container.
    if (el.tagName === 'INPUT') {
      if (el.value && el.value.trim()) return el.value.trim();
      const container = el.closest('[class*="select__control"],[class*="container"],[class*="control"]')
        || el.parentElement?.parentElement || el.parentElement;
      return container ? containerText(container) : '';
    }
    return containerText(el);
  }
  return '';
}

function containerText(container) {
  const clone = container.cloneNode(true);
  for (const c of clone.querySelectorAll('input,button,svg,[class*="placeholder"],[class*="Placeholder"],[class*="indicator"],[class*="Indicator"]')) c.remove();
  return clone.textContent.trim();
}

export function isVisible(el) {
  if (el.hidden || el.getAttribute('aria-hidden') === 'true') return false;
  if (el.offsetParent !== null || el.getClientRects().length > 0) return true;
  // Environments without layout (jsdom tests): fall back to computed style.
  // In real browsers a zero-rect element also lands here; position() keeps its
  // icon hidden anyway, so a false positive is harmless.
  const st = el.ownerDocument.defaultView.getComputedStyle(el);
  return st.display !== 'none' && st.visibility !== 'hidden';
}

// Floating "save this field" icons. One icon per unique fingerprint that has
// no usable saved value; clicking it stores the field's current value under an
// auto-generated key and maps the fingerprint to it.
export function createSaveIcons(doc, store, { collectFields, onSaved } = {}) {
  const win = doc.defaultView;
  let icons = new Map(); // fingerprint -> { btn, field }
  let enabled = false;
  let observer = null;
  let rescanTimer = null;

  function position(btn, field) {
    const rect = field.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) { btn.style.display = 'none'; return; }
    btn.style.display = 'flex';
    btn.style.top = (rect.top + win.scrollY + Math.max(0, (rect.height - 22) / 2)) + 'px';
    btn.style.left = (rect.right + win.scrollX + 6) + 'px';
  }

  function repositionAll() {
    for (const { btn, field } of icons.values()) position(btn, field);
  }

  function flash(btn, text, cls) {
    btn.textContent = text;
    btn.classList.add(cls);
    setTimeout(() => { btn.remove(); }, 900);
  }

  function makeIcon(field, fp) {
    const btn = doc.createElement('button');
    btn.type = 'button';
    btn.className = 'appfiller-save-icon';
    btn.title = 'AppFiller: save this field’s value for next time';
    btn.textContent = '\u{1F4BE}';
    btn.addEventListener('click', async (e) => {
      e.preventDefault(); e.stopPropagation();
      const type = getFieldType(field);
      const value = readCurrentValue(field, type);
      if (!value) {
        btn.classList.add('appfiller-save-icon-err');
        btn.title = 'Fill the field in first, then click to save it';
        setTimeout(() => btn.classList.remove('appfiller-save-icon-err'), 600);
        return;
      }
      let key = autoKey(getLabelText(field));
      if (!key) key = 'field_' + Math.abs(hashCode(fp)).toString(36);
      await store.setValue(key, value);
      await store.setMapping(fp, key);
      icons.delete(fp);
      flash(btn, '✓', 'appfiller-save-icon-ok');
      onSaved?.(field, key, value);
    }, true);
    doc.body.appendChild(btn);
    position(btn, field);
    return btn;
  }

  async function refresh() {
    if (!enabled) return;
    const [values, mappings] = await Promise.all([store.getValues(), store.getMappings()]);
    const fields = collectFields(doc);
    const wanted = new Map(); // fp -> field
    for (const field of fields) {
      if (!isVisible(field)) continue;
      const fp = fingerprint(field);
      if (wanted.has(fp)) continue; // one icon per radio group / duplicate label
      const valueKey = mappings[fp];
      if (valueKey && valueKey in values) continue; // autofillable -> no icon
      wanted.set(fp, field);
    }
    // Drop icons for fields that vanished or got a saved value.
    for (const [fp, { btn }] of icons) {
      if (!wanted.has(fp)) { btn.remove(); icons.delete(fp); }
    }
    // Add icons for new fields.
    for (const [fp, field] of wanted) {
      const existing = icons.get(fp);
      if (existing) {
        if (existing.field !== field) { existing.field = field; }
        position(existing.btn, existing.field);
        continue;
      }
      icons.set(fp, { btn: makeIcon(field, fp), field });
    }
  }

  function scheduleRescan() {
    if (rescanTimer) return;
    rescanTimer = setTimeout(() => { rescanTimer = null; refresh(); }, 400);
  }

  const onScroll = () => win.requestAnimationFrame(repositionAll);
  const onKey = (e) => { if (e.key === 'Escape') api.disable(); };

  const api = {
    async enable() {
      if (enabled) { await refresh(); return; }
      enabled = true;
      win.addEventListener('scroll', onScroll, { capture: true, passive: true });
      win.addEventListener('resize', onScroll, { passive: true });
      doc.addEventListener('keydown', onKey, true);
      observer = new win.MutationObserver((muts) => {
        for (const m of muts) {
          const t = m.target;
          if (t.classList && (t.classList.contains('appfiller-save-icon'))) return;
        }
        scheduleRescan();
      });
      observer.observe(doc.body, { childList: true, subtree: true });
      await refresh();
    },
    disable() {
      enabled = false;
      if (observer) { observer.disconnect(); observer = null; }
      if (rescanTimer) { clearTimeout(rescanTimer); rescanTimer = null; }
      win.removeEventListener('scroll', onScroll, { capture: true });
      win.removeEventListener('resize', onScroll);
      doc.removeEventListener('keydown', onKey, true);
      for (const { btn } of icons.values()) btn.remove();
      icons.clear();
    },
    refresh,
    isEnabled: () => enabled,
    _icons: icons,
  };
  return api;
}

function hashCode(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) { h = (h * 31 + s.charCodeAt(i)) | 0; }
  return h;
}
