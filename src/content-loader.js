// Classic loader: manifest content scripts can't be ES modules, but they may
// dynamically import one. This bootstraps the real module content.js.
(async () => {
  try {
    await import(chrome.runtime.getURL('src/content.js'));
  } catch (e) {
    console.error('[AppFiller] failed to load content module', e);
  }
})();
