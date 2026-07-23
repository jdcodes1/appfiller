import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../src/lib/storage.js';

function fakeBackend(initial = {}) {
  let data = { ...initial };
  return {
    async get(keys) {
      const out = {};
      for (const k of [].concat(keys)) if (k in data) out[k] = data[k];
      return out;
    },
    async set(obj) { data = { ...data, ...obj }; },
    _data: () => data,
  };
}

test('values round-trip and delete', async () => {
  const b = fakeBackend();
  const s = createStore(b);
  assert.deepEqual(await s.getValues(), {});
  await s.setValue('gender', 'Male');
  await s.setValue('linkedin', 'https://x');
  assert.deepEqual(await s.getValues(), { gender: 'Male', linkedin: 'https://x' });
  await s.deleteValue('gender');
  assert.deepEqual(await s.getValues(), { linkedin: 'https://x' });
});

test('mappings round-trip and delete', async () => {
  const s = createStore(fakeBackend());
  await s.setMapping('gender|select', 'gender');
  assert.deepEqual(await s.getMappings(), { 'gender|select': 'gender' });
  await s.deleteMapping('gender|select');
  assert.deepEqual(await s.getMappings(), {});
});

test('settings default and set', async () => {
  const s = createStore(fakeBackend());
  assert.deepEqual(await s.getSettings(), { autoFillOnLoad: false });
  await s.setSetting('autoFillOnLoad', true);
  assert.deepEqual(await s.getSettings(), { autoFillOnLoad: true });
});
