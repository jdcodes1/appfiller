export function normalize(text) {
  return (text || '')
    .toLowerCase()
    .replace(/[\s ]+/g, ' ')
    .trim()
    .replace(/[\s*.:?!,;]+$/g, '')
    .trim();
}

// Inputs that are really the search box of a custom dropdown (react-select on
// Greenhouse, Ashby's combobox, etc). Typing into them never selects an option,
// so they must go through the dropdown fill path, not the text path.
export function isComboboxInput(el) {
  if (el.tagName !== 'INPUT') return false;
  if ((el.getAttribute('role') || '').toLowerCase() === 'combobox') return true;
  const ac = (el.getAttribute('aria-autocomplete') || '').toLowerCase();
  if (ac === 'list' || ac === 'both') return true;
  if ((el.getAttribute('aria-haspopup') || '').toLowerCase() === 'listbox') return true;
  return !!(el.closest && el.closest('[class*="select__control"]'));
}

export function getFieldType(el) {
  const tag = el.tagName.toLowerCase();
  if (tag === 'textarea') return 'textarea';
  if (tag === 'select') return 'select';
  if (tag === 'input') {
    const t = (el.getAttribute('type') || 'text').toLowerCase();
    if (t === 'radio') return 'radio';
    if (t === 'checkbox') return 'checkbox';
    if (isComboboxInput(el)) return 'dropdown';
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
    const safeId = (typeof CSS !== 'undefined' && CSS.escape) ? CSS.escape(el.id) : el.id;
    const forLabel = doc.querySelector(`label[for="${safeId}"]`);
    if (forLabel) return forLabel.textContent.trim();
  }

  // For radio/checkbox, the group question (fieldset legend) identifies the
  // field — the per-option wrapping <label> is the option text, not the
  // field's identity. Check the legend before the wrapping label.
  const type = (el.getAttribute && el.getAttribute('type') || '').toLowerCase();
  if (type === 'radio' || type === 'checkbox') {
    const fs = el.closest && el.closest('fieldset');
    if (fs) {
      const lg = fs.querySelector('legend');
      if (lg && lg.textContent.trim()) return lg.textContent.trim();
    }
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
