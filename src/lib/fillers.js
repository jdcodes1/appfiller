export function matchOptionText(candidates, value) {
  const v = (value || '').toLowerCase().trim();
  if (!v) return -1;
  // 1. Exact (case-insensitive) match wins — avoids "Female" matching "Male".
  for (let i = 0; i < candidates.length; i++) {
    if ((candidates[i] || '').toLowerCase().trim() === v) return i;
  }
  // 2. Fall back to substring match.
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
  const previous = el.value;
  setter.call(el, value);
  // React keeps a _valueTracker holding the last value it rendered. If it still
  // matches what we just wrote, React treats the input event as a no-op and
  // reverts the field on its next render. Force it stale with the old value so
  // React's change plugin registers a real change and updates its state.
  const tracker = el._valueTracker;
  if (tracker && typeof tracker.setValue === 'function') tracker.setValue(previous);
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

function cssEscape(s) {
  return (typeof CSS !== 'undefined' && CSS.escape) ? CSS.escape(s) : s;
}

function radioLabelText(radio) {
  const doc = radio.ownerDocument;
  if (radio.id) {
    const l = doc.querySelector(`label[for="${cssEscape(radio.id)}"]`);
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
    ? radioEl.ownerDocument.querySelectorAll(`input[type="radio"][name="${cssEscape(name)}"]`)
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

// openAndWait(controlEl, searchText) opens the menu (typing searchText into
// combobox inputs to filter async/long option lists) and resolves with the
// visible option elements.
export async function fillDropdown(controlEl, value, { openAndWait }) {
  const options = await openAndWait(controlEl, value);
  const idx = matchOptionText(options.map(o => o.textContent), value);
  if (idx === -1) return false;
  realClick(options[idx]);
  return true;
}
