import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { setNativeValue, realClick, findOptions, fillDropdown } from '../src/lib/fillers.js';
import { alreadyHasValue, fillPage, autoFillWithRetries } from '../src/content.js';
import * as F from '../src/lib/fillers.js';

const deps = {
  ...F,
  openAndWait: async (el) => { realClick(el); return findOptions(el.ownerDocument); },
};

// Regression: React keeps a _valueTracker of the last value it rendered. If the
// tracker still matches what we just wrote, React treats the input event as a
// no-op and reverts the field on its next render — the "value appears then
// disappears" bug. Writing must leave the tracker holding the PREVIOUS value.
test('setNativeValue makes React value tracker stale', () => {
  const w = new JSDOM('<body><input id="t" type="text" value="old"></body>').window;
  const el = w.document.getElementById('t');
  let trackedAs = null;
  el._valueTracker = { setValue: (v) => { trackedAs = v; } };
  setNativeValue(el, 'new value');
  assert.equal(el.value, 'new value');
  assert.equal(trackedAs, 'old', 'tracker must be reset to the previous value');
});

test('alreadyHasValue detects filled text, select and dropdown', () => {
  const w = new JSDOM(`<body>
    <input id="t" type="text" value="Joey">
    <select id="s"><option>Male</option><option selected>Female</option></select>
    <div id="dd" role="combobox"><span>Asian</span></div>
  </body>`).window;
  const d = w.document;
  assert.equal(alreadyHasValue(d.getElementById('t'), 'text', 'Joey'), true);
  assert.equal(alreadyHasValue(d.getElementById('t'), 'text', 'Other'), false);
  assert.equal(alreadyHasValue(d.getElementById('s'), 'select', 'Female'), true);
  assert.equal(alreadyHasValue(d.getElementById('s'), 'select', 'Male'), false);
  assert.equal(alreadyHasValue(d.getElementById('dd'), 'dropdown', 'Asian'), true);
  assert.equal(alreadyHasValue(d.getElementById('dd'), 'dropdown', 'White'), false);
});

// A second pass must not re-open a dropdown that already shows the right value,
// or it would be left hanging open on the page.
test('fillPage does not re-click a dropdown already showing the value', async () => {
  const w = new JSDOM(`<body>
    <label id="l">Race/Ethnicity</label>
    <div id="dd" role="combobox" aria-labelledby="l"><span>Asian</span></div>
  </body>`).window;
  let opens = 0;
  const state = { values: { race: 'Asian' }, mappings: { 'race/ethnicity|dropdown': 'race' } };
  const spyDeps = { ...deps, openAndWait: async (el) => { opens++; return findOptions(el.ownerDocument); } };
  const res = await fillPage(w.document, state, spyDeps);
  assert.equal(opens, 0, 'dropdown should not be opened when already correct');
  assert.equal(res.filled, 1, 'already-correct field still counts as filled');
});

// The core fix: a late React mount wipes the field after the first pass.
// Retry passes must restore it.
test('autoFillWithRetries refills a field cleared after the first pass', async () => {
  const w = new JSDOM(`<body><label for="li">LinkedIn Profile</label><input id="li" type="url"></body>`).window;
  const el = w.document.getElementById('li');
  const state = { values: { linkedin: 'https://x' }, mappings: { 'linkedin profile|text': 'linkedin' } };

  let pass = 0;
  const wait = async () => {
    pass++;
    if (pass === 1) el.value = ''; // simulate React re-render wiping the field
  };

  await autoFillWithRetries(w.document, async () => state, { delays: [0, 10, 20], wait, deps });
  assert.equal(el.value, 'https://x', 'value must be restored by a later pass');
});
