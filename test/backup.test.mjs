import { test } from 'node:test';
import assert from 'node:assert/strict';
import { serializeBackup, parseBackup, isStorageEmpty, mergeBackup } from '../src/lib/backup.js';

test('serializeBackup produces versioned envelope', () => {
  const out = serializeBackup({ values: { gender: 'Male' }, mappings: { 'a|b': 'gender' } }, '2026-07-23T00:00:00.000Z');
  assert.deepEqual(out, {
    version: 1,
    exportedAt: '2026-07-23T00:00:00.000Z',
    values: { gender: 'Male' },
    mappings: { 'a|b': 'gender' },
  });
});

test('serializeBackup -> parseBackup round-trips', () => {
  const state = { values: { gender: 'Male', linkedin: 'https://x' }, mappings: { 'a|b': 'gender' } };
  const text = JSON.stringify(serializeBackup(state, '2026-07-23T00:00:00.000Z'));
  assert.deepEqual(parseBackup(text), state);
});

test('parseBackup throws clear error on invalid JSON', () => {
  assert.throws(() => parseBackup('{not json'), /Error/);
  assert.throws(() => parseBackup('{not json'), (err) => err instanceof Error && err.message.length > 0);
});

test('parseBackup throws on non-object JSON', () => {
  assert.throws(() => parseBackup('42'), /object/i);
  assert.throws(() => parseBackup('null'), /object/i);
  assert.throws(() => parseBackup('"hello"'), /object/i);
  assert.throws(() => parseBackup('[1,2,3]'), /object/i);
});

test('parseBackup throws when both values and mappings are missing', () => {
  assert.throws(() => parseBackup('{}'), /values|mappings/i);
  assert.throws(() => parseBackup(JSON.stringify({ version: 1 })), /values|mappings/i);
});

test('parseBackup throws when both values and mappings are wrong type', () => {
  assert.throws(() => parseBackup(JSON.stringify({ values: 'x', mappings: 5 })), /values|mappings/i);
});

test('parseBackup defaults missing sibling to {} when the other is present', () => {
  assert.deepEqual(parseBackup(JSON.stringify({ values: { a: '1' } })), { values: { a: '1' }, mappings: {} });
  assert.deepEqual(parseBackup(JSON.stringify({ mappings: { fp: 'a' } })), { values: {}, mappings: { fp: 'a' } });
});

test('parseBackup ignores unknown top-level fields', () => {
  const out = parseBackup(JSON.stringify({ values: { a: '1' }, mappings: {}, version: 1, exportedAt: 'x', extra: true }));
  assert.deepEqual(out, { values: { a: '1' }, mappings: {} });
});

test('isStorageEmpty true for absent/empty state', () => {
  assert.equal(isStorageEmpty({}), true);
  assert.equal(isStorageEmpty({ values: {}, mappings: {} }), true);
  assert.equal(isStorageEmpty({ values: undefined, mappings: undefined }), true);
});

test('isStorageEmpty false when either has entries', () => {
  assert.equal(isStorageEmpty({ values: { a: '1' }, mappings: {} }), false);
  assert.equal(isStorageEmpty({ values: {}, mappings: { fp: 'a' } }), false);
});

test('mergeBackup overwrites on collision and preserves current-only keys', () => {
  const current = { values: { a: '1', b: '2' }, mappings: { 'fp1': 'a' } };
  const incoming = { values: { b: '20', c: '3' }, mappings: { fp1: 'z', fp2: 'c' } };
  assert.deepEqual(mergeBackup(current, incoming), {
    values: { a: '1', b: '20', c: '3' },
    mappings: { fp1: 'z', fp2: 'c' },
  });
});
