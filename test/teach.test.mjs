import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { buildTeachPanel, teachController } from '../src/content.js';

function fakeStore(values = {}, mappings = {}) {
  return {
    async getValues() { return { ...values }; },
    async getMappings() { return { ...mappings }; },
    async setValue(k, v) { values[k] = v; },
    async setMapping(fp, vk) { mappings[fp] = vk; },
    _values: values, _mappings: mappings,
  };
}

test('buildTeachPanel lists existing keys + create-new', () => {
  const doc = new JSDOM('<body></body>').window.document;
  const panel = buildTeachPanel(doc, { labelText: 'Gender', valueKeys: ['gender', 'linkedin'] });
  const opts = Array.from(panel.querySelectorAll('.af-key option')).map(o => o.value);
  assert.deepEqual(opts, ['gender', 'linkedin', '__new__']);
  assert.match(panel.textContent, /Gender/);
});

test('teachController saves mapping to existing key on field click + save', async () => {
  const w = new JSDOM(`<body><label for="g">Gender</label><select id="g"><option>Male</option></select></body>`).window;
  // jsdom lacks layout; stub getBoundingClientRect so panel positioning works.
  w.HTMLElement.prototype.getBoundingClientRect = () => ({ top: 0, left: 0, bottom: 0, right: 0, width: 0, height: 0 });
  global.window = w; global.document = w.document;
  const store = fakeStore({ gender: 'Male' }, {});
  let taught = null;
  const ctrl = teachController(w.document, store, (el, vk) => { taught = vk; });
  ctrl.start();
  const field = w.document.getElementById('g');
  field.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  await new Promise(r => setTimeout(r, 0));
  const panel = w.document.querySelector('.appfiller-panel');
  assert.ok(panel, 'panel rendered');
  panel.querySelector('.af-key').value = 'gender';
  panel.querySelector('.af-save').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  await new Promise(r => setTimeout(r, 0));
  assert.equal(store._mappings['gender|select'], 'gender');
  assert.equal(taught, 'gender');
  ctrl.stop();
});
