import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { findOptions, fillDropdown, realClick } from '../src/lib/fillers.js';

// Mimics an Ashby/react-select control: clicking the control renders a listbox.
function ashbyDom() {
  const dom = new JSDOM(`<body>
    <div id="ctrl" role="combobox" aria-haspopup="listbox"><span>Select...</span></div>
    <div id="menu"></div>
  </body>`);
  const doc = dom.window.document;
  const ctrl = doc.getElementById('ctrl');
  const menu = doc.getElementById('menu');
  ctrl.addEventListener('click', () => {
    menu.innerHTML = `
      <div role="option">Asian</div>
      <div role="option">Black or African American</div>
      <div role="option">White</div>`;
  });
  // Clicking an option writes the chosen text back into the control.
  menu.addEventListener('click', (e) => {
    if (e.target.getAttribute('role') === 'option') {
      ctrl.querySelector('span').textContent = e.target.textContent;
    }
  });
  return dom.window;
}

test('realClick fires a bubbling click', () => {
  const w = new JSDOM(`<body><button id="b"></button></body>`).window;
  const el = w.document.getElementById('b');
  let clicked = false;
  el.addEventListener('click', () => { clicked = true; });
  realClick(el);
  assert.equal(clicked, true);
});

test('findOptions returns role=option elements', () => {
  const w = ashbyDom();
  w.document.getElementById('ctrl').click();
  const opts = findOptions(w.document);
  assert.equal(opts.length, 3);
});

test('fillDropdown opens, matches, and selects the option', async () => {
  const w = ashbyDom();
  const ctrl = w.document.getElementById('ctrl');
  const openAndWait = async (el) => { realClick(el); return findOptions(el.ownerDocument); };
  const ok = await fillDropdown(ctrl, 'Asian', { openAndWait });
  assert.equal(ok, true);
  assert.equal(ctrl.querySelector('span').textContent, 'Asian');
});

test('fillDropdown returns false when no option matches', async () => {
  const w = ashbyDom();
  const ctrl = w.document.getElementById('ctrl');
  const openAndWait = async (el) => { realClick(el); return findOptions(el.ownerDocument); };
  assert.equal(await fillDropdown(ctrl, 'Martian', { openAndWait }), false);
});
