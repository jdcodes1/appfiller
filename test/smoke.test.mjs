import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('manifest is valid MV3', () => {
  const m = JSON.parse(readFileSync(new URL('../manifest.json', import.meta.url)));
  assert.equal(m.manifest_version, 3);
  assert.deepEqual(m.permissions.sort(), ['activeTab', 'scripting', 'storage']);
  assert.ok(m.content_scripts[0].matches.includes('<all_urls>'));
  assert.equal(m.action.default_popup, 'src/popup.html');
  assert.equal(m.options_page, 'src/options.html');
});
