import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('ES-module content script is loaded via loader + web_accessible_resources', () => {
  const m = JSON.parse(readFileSync(new URL('../manifest.json', import.meta.url)));
  const content = readFileSync(new URL('../src/content.js', import.meta.url), 'utf8');
  const hasTopLevelImport = /^\s*import\s.+from\s/m.test(content);
  if (!hasTopLevelImport) return; // content.js not a module; nothing to enforce
  const js = m.content_scripts[0].js;
  assert.ok(!js.includes('src/content.js'),
    'content.js uses ES imports but is declared directly as a classic content script');
  const war = (m.web_accessible_resources || []).flatMap(w => w.resources);
  assert.ok(war.includes('src/content.js'), 'content.js must be web-accessible for dynamic import');
  assert.ok(war.some(r => r.startsWith('src/lib/')), 'lib modules must be web-accessible');
});
