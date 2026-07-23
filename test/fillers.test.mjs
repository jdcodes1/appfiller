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
