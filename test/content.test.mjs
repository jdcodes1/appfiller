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
  // Both radios of the group are collected and each is filled (idempotent),
  // so the group contributes 2 to the count: li + gn + hy + hn = 4.
  assert.equal(res.filled, 4);
});
