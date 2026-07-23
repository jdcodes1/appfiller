import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { normalize, getFieldType, getLabelText, fingerprint } from '../src/lib/fingerprint.js';

function dom(html) { return new JSDOM(`<body>${html}</body>`).window.document; }

test('normalize lowercases, collapses ws, strips trailing * and punctuation', () => {
  assert.equal(normalize('  LinkedIn   Profile *'), 'linkedin profile');
  assert.equal(normalize('Are you Hispanic/Latino?'), 'are you hispanic/latino');
});

test('getFieldType detects native types', () => {
  const d = dom(`
    <input id="t" type="text">
    <textarea id="ta"></textarea>
    <select id="s"></select>
    <input id="r" type="radio">
    <input id="c" type="checkbox">
    <div id="dd" role="combobox"></div>`);
  assert.equal(getFieldType(d.getElementById('t')), 'text');
  assert.equal(getFieldType(d.getElementById('ta')), 'textarea');
  assert.equal(getFieldType(d.getElementById('s')), 'select');
  assert.equal(getFieldType(d.getElementById('r')), 'radio');
  assert.equal(getFieldType(d.getElementById('c')), 'checkbox');
  assert.equal(getFieldType(d.getElementById('dd')), 'dropdown');
});

test('getLabelText prefers aria-label, then <label for>, then legend', () => {
  const d1 = dom(`<input id="a" aria-label="GitHub URL">`);
  assert.equal(getLabelText(d1.getElementById('a')), 'GitHub URL');

  const d2 = dom(`<label for="b">LinkedIn Profile</label><input id="b">`);
  assert.equal(getLabelText(d2.getElementById('b')), 'LinkedIn Profile');

  const d3 = dom(`<fieldset><legend>Gender</legend><input id="c" type="radio"></fieldset>`);
  assert.equal(getLabelText(d3.getElementById('c')), 'Gender');

  const d4 = dom(`<label>Wrapped Q<input id="d"></label>`);
  assert.equal(getLabelText(d4.getElementById('d')), 'Wrapped Q');
});

test('fingerprint combines label and type', () => {
  const d = dom(`<label for="g">Gender</label><select id="g"></select>`);
  assert.equal(fingerprint(d.getElementById('g')), 'gender|select');
});

// Regression: a radio wrapped in its own option <label> inside a fieldset must
// fingerprint by the group legend, not the per-option text ("Yes"/"No").
test('radio in option-label uses group legend, not option text', () => {
  const d = dom(`<fieldset><legend>Are you Hispanic/Latino?</legend>
    <label><input type="radio" name="hl" id="hy">Yes</label>
    <label><input type="radio" name="hl" id="hn">No</label>
  </fieldset>`);
  assert.equal(getLabelText(d.getElementById('hy')), 'Are you Hispanic/Latino?');
  assert.equal(fingerprint(d.getElementById('hy')), 'are you hispanic/latino|radio');
  assert.equal(fingerprint(d.getElementById('hn')), 'are you hispanic/latino|radio');
});
