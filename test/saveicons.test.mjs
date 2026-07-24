import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { autoKey, readCurrentValue, createSaveIcons } from '../src/lib/saveicons.js';
import { getFieldType } from '../src/lib/fingerprint.js';
import { collectFields } from '../src/content.js';
import { createStore } from '../src/lib/storage.js';

function dom(html) {
  const jsdom = new JSDOM(`<body>${html}</body>`, { pretendToBeVisual: true });
  return jsdom.window.document;
}

function memStore(seed = {}) {
  const data = { values: {}, mappings: {}, ...seed };
  return createStore({
    get: async (k) => (k in data ? { [k]: data[k] } : {}),
    set: async (o) => Object.assign(data, o),
  });
}

test('autoKey slugs labels into snake_case keys', () => {
  assert.equal(autoKey('First Name *'), 'first_name');
  assert.equal(autoKey('LinkedIn Profile'), 'linkedin_profile');
  assert.equal(autoKey('Are you Hispanic/Latino?'), 'are_you_hispanic_latino');
  assert.equal(autoKey('  '), '');
});

test('readCurrentValue per field type', () => {
  const d = dom(`
    <input id="t" type="text" value=" Joey ">
    <select id="s"><option value="">Pick…</option><option value="m" selected>Male</option></select>
    <fieldset>
      <label><input type="radio" name="vet" value="1"> Yes, I am a veteran</label>
      <label><input type="radio" name="vet" value="2" checked> No, I am not</label>
    </fieldset>
    <input id="c" type="checkbox" checked>`);
  assert.equal(readCurrentValue(d.getElementById('t'), 'text'), 'Joey');
  assert.equal(readCurrentValue(d.getElementById('s'), 'select'), 'Male');
  assert.equal(readCurrentValue(d.querySelector('input[name="vet"]'), 'radio'), 'No, I am not');
  assert.equal(readCurrentValue(d.getElementById('c'), 'checkbox'), 'yes');
});

test('readCurrentValue for combobox input reads container text, not placeholder', () => {
  const d = dom(`
    <div class="select__control">
      <div class="select__single-value">Asian</div>
      <div class="select__placeholder">Select…</div>
      <input id="cb" role="combobox" value="">
    </div>`);
  assert.equal(readCurrentValue(d.getElementById('cb'), 'dropdown'), 'Asian');
});

test('save icon appears only for unmapped fields; click saves auto-keyed value + mapping', async () => {
  const d = dom(`
    <label for="fn">First Name *</label><input id="fn" type="text" value="Joey">
    <label for="ln">Last Name *</label><input id="ln" type="text" value="Dafforn">`);
  const store = memStore({ values: { first_name: 'Joey' }, mappings: { 'first name|text': 'first_name' } });
  const icons = createSaveIcons(d, store, { collectFields });
  await icons.enable();

  const btns = d.querySelectorAll('.appfiller-save-icon');
  assert.equal(btns.length, 1); // only Last Name is unmapped

  btns[0].click();
  await new Promise(r => setTimeout(r, 10));
  assert.equal((await store.getValues()).last_name, 'Dafforn');
  assert.equal((await store.getMappings())['last name|text'], 'last_name');
  assert.equal(d.querySelectorAll('.appfiller-save-icon:not(.appfiller-save-icon-ok)').length, 0);
});

test('clicking icon on an empty field does not save', async () => {
  const d = dom(`<label for="gh">GitHub URL</label><input id="gh" type="text" value="">`);
  const store = memStore();
  const icons = createSaveIcons(d, store, { collectFields });
  await icons.enable();
  const btn = d.querySelector('.appfiller-save-icon');
  btn.click();
  await new Promise(r => setTimeout(r, 10));
  assert.deepEqual(await store.getValues(), {});
  assert.ok(d.querySelector('.appfiller-save-icon')); // still there
});

test('one icon per radio group; refresh drops icons once mapped', async () => {
  const d = dom(`
    <fieldset><legend>Veteran status</legend>
      <label><input type="radio" name="vet" value="1"> Yes</label>
      <label><input type="radio" name="vet" value="2"> No</label>
    </fieldset>`);
  const store = memStore();
  const icons = createSaveIcons(d, store, { collectFields });
  await icons.enable();
  assert.equal(d.querySelectorAll('.appfiller-save-icon').length, 1);

  await store.setValue('veteran_status', 'No');
  await store.setMapping('veteran status|radio', 'veteran_status');
  await icons.refresh();
  assert.equal(d.querySelectorAll('.appfiller-save-icon').length, 0);
});

test('disable removes all icons', async () => {
  const d = dom(`<label for="x">Website</label><input id="x" type="text">`);
  const icons = createSaveIcons(d, memStore(), { collectFields });
  await icons.enable();
  assert.equal(d.querySelectorAll('.appfiller-save-icon').length, 1);
  icons.disable();
  assert.equal(d.querySelectorAll('.appfiller-save-icon').length, 0);
  assert.equal(icons.isEnabled(), false);
});

test('no icon for a radio group when any option is already mapped', async () => {
  const d = dom(`
    <label><input type="radio" name="consent" value="1"> Yes I consent</label>
    <label><input type="radio" name="consent" value="2"> No I do not</label>`);
  const store = memStore({
    values: { yes_i_consent: 'Yes I consent' },
    mappings: { 'yes i consent|radio': 'yes_i_consent' },
  });
  const icons = createSaveIcons(d, store, { collectFields });
  await icons.enable();
  assert.equal(d.querySelectorAll('.appfiller-save-icon').length, 0);
});
