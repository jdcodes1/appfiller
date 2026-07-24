import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { getFieldType, isComboboxInput } from '../src/lib/fingerprint.js';
import { collectFields, fillPage, openAndWaitReal } from '../src/content.js';
import * as F from '../src/lib/fillers.js';

function dom(html) {
  const jsdom = new JSDOM(`<body>${html}</body>`, { pretendToBeVisual: true });
  return jsdom.window.document;
}

// Greenhouse/Ashby style: the dropdown is an <input role="combobox"> inside a
// react-select control. It must be classified as a dropdown, not text.
test('input[role=combobox] and aria-autocomplete inputs classify as dropdown', () => {
  const d = dom(`
    <input id="a" role="combobox">
    <input id="b" aria-autocomplete="list">
    <input id="c" aria-haspopup="listbox">
    <div class="select__control"><input id="e" type="text"></div>
    <input id="plain" type="text">`);
  for (const id of ['a', 'b', 'c', 'e']) {
    assert.equal(isComboboxInput(d.getElementById(id)), true, id);
    assert.equal(getFieldType(d.getElementById(id)), 'dropdown', id);
  }
  assert.equal(getFieldType(d.getElementById('plain')), 'text');
});

test('collectFields keeps the combobox input, drops its wrapping control', () => {
  const d = dom(`
    <div class="select__control" id="ctrl"><input id="cb" role="combobox"></div>
    <div class="select__control" id="ctrl2">no input here</div>`);
  const fields = collectFields(d);
  const ids = fields.map(e => e.id);
  assert.ok(ids.includes('cb'));
  assert.ok(!ids.includes('ctrl'), 'wrapper containing collected input must be deduped');
  assert.ok(ids.includes('ctrl2'), 'input-less dropdown container still collected');
});

test('fillPage fills a combobox input by typing then clicking the option', async () => {
  const d = dom(`
    <label for="cb">School</label>
    <div class="select__control"><input id="cb" role="combobox" value=""></div>
    <div id="menu"></div>`);
  // Simulate an async-filtered menu: options appear only after text is typed.
  const cb = d.getElementById('cb');
  cb.addEventListener('input', () => {
    d.getElementById('menu').innerHTML =
      '<div role="option">Purdue University</div><div role="option">Purdue Global</div>';
  });
  d.getElementById('menu').addEventListener('click', (e) => {
    if (e.target.getAttribute('role') === 'option') {
      d.querySelector('.select__control').insertAdjacentHTML(
        'afterbegin', `<div class="select__single-value">${e.target.textContent}</div>`);
      cb.value = '';
    }
  });

  const state = {
    values: { school: 'Purdue University' },
    mappings: { 'school|dropdown': 'school' },
  };
  const res = await fillPage(d, state, {
    ...F,
    openAndWait: (el, text) => openAndWaitReal(el, text, (ms) => new Promise(r => setTimeout(r, 1))),
  });
  assert.equal(res.filled, 1);
  assert.ok(d.querySelector('.select__single-value').textContent.includes('Purdue University'));
});

test('alreadyHasValue via control container text prevents re-clicking combobox', async () => {
  const d = dom(`
    <label for="cb">School</label>
    <div class="select__control"><div class="select__single-value">Purdue University</div><input id="cb" role="combobox" value=""></div>`);
  let opened = 0;
  const state = { values: { school: 'Purdue University' }, mappings: { 'school|dropdown': 'school' } };
  const res = await fillPage(d, state, { ...F, openAndWait: async () => { opened++; return []; } });
  assert.equal(opened, 0);
  assert.equal(res.filled, 1);
});
